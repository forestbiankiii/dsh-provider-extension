import type { UsageState, UsageStep } from './fold.js'
import type { UsageMetrics, UsagePrice, UsageQuery, UsageRank, UsageReport, UsageSession } from './types.js'

export interface UsageReportSession {
  header: { id: string; cwd?: string; parentSession?: string; origin?: 'subagent'; createdAt: number }
  title: string
  state: UsageState
}
export type AggregatedUsageReport = Omit<UsageReport, 'coverage' | 'priceStorage'>
const dayMs = 86_400_000
const deepseek = /^deepseek(?:$|[-_/:.])/i
function emptyMetrics(): UsageMetrics {
  return {
    requests: 0, succeeded: 0, failed: 0, cancelled: 0, retries: 0, missingUsage: 0, partialUsage: 0,
    inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
    elapsedMs: 0, timedRequests: 0, ttftMs: 0, ttftRequests: 0, decodeMs: 0, decodeTokens: 0,
    unpricedRequests: 0, costs: [],
  }
}
/** Decimal rates become rational integers before multiplication; no per-token rounding. */
function decimal(value: number): { numerator: bigint; scale: number } {
  const [mantissa = '0', exponent = '0'] = value.toString().toLowerCase().split('e')
  const [whole = '0', fraction = ''] = mantissa.split('.')
  const scale = fraction.length - Number(exponent)
  const numerator = BigInt(whole + fraction)
  return scale < 0 ? { numerator: numerator * 10n ** BigInt(-scale), scale: 0 } : { numerator, scale }
}
function cost(row: UsageStep, price: UsagePrice | undefined): number | null {
  const usage = row.usage
  if (!deepseek.test(row.provider) || !price || !usage || row.missingUsage > 0) return null
  if (![price.input, price.output, price.cacheRead, price.cacheWrite].every(rate => rate === null || Number.isFinite(rate) && rate >= 0)) return null
  const missingRead = usage.missingOptional.includes('cacheReadTokens')
  const missingWrite = usage.missingOptional.includes('cacheWriteTokens')
  // Normalize inclusive/exclusive input per attempt before summing retries. Never guess cache-write semantics.
  if (usage.cacheWriteTokens > 0 || missingWrite && price.cacheWrite !== 0) return null
  if (missingRead) return null // Without cache usage, inclusive/exclusive input cannot be established.
  if (usage.cacheReadTokens > 0 && price.cacheRead === null) return null
  const read = missingRead ? 0 : usage.cacheReadTokens
  if (usage.uncachedInputTokens === null) return null
  const terms: [number, number][] = [[usage.uncachedInputTokens, price.input], [usage.outputTokens, price.output]]
  if (read > 0) terms.push([read, price.cacheRead!])
  const fractions = terms.map(([tokens, rate]) => ({ tokens, ...decimal(rate) }))
  const scale = Math.max(...fractions.map(part => part.scale))
  const numerator = fractions.reduce((sum, part) => sum + BigInt(part.tokens) * part.numerator * 10n ** BigInt(scale - part.scale), 0n)
  return Number(numerator) / 10 ** (scale + 6)
}
function metrics(row: UsageStep, prices: Map<string, UsagePrice>): UsageMetrics {
  const result = emptyMetrics()
  result.requests = 1
  if (row.finalized && row.status === 'succeeded') result.succeeded = 1
  if (row.finalized && row.status === 'failed') result.failed = 1
  if (row.finalized && row.status === 'cancelled') result.cancelled = 1
  result.retries = row.retries
  result.missingUsage = Number(row.usage === null || row.missingUsage > 0)
  result.partialUsage = Number(row.usage !== null && (row.partial || row.missingUsage > 0))
  if (row.usage) {
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const) result[key] = row.usage[key]
  }
  const endedAt = row.modelEndedAt ?? row.endedAt
  if (endedAt !== null && endedAt >= row.startedAt) {
    result.elapsedMs = endedAt - row.startedAt
    result.timedRequests = 1
  }
  if (row.firstTokenAt !== null && row.firstTokenAt >= row.startedAt) {
    result.ttftMs = row.firstTokenAt - row.startedAt
    result.ttftRequests = 1
    if (endedAt !== null && endedAt > row.firstTokenAt && row.usage) {
      result.decodeMs = endedAt - row.firstTokenAt
      result.decodeTokens = row.usage.outputTokens
    }
  }
  const price = prices.get(JSON.stringify([row.provider, row.model]))
  const amount = cost(row, price)
  if (amount === null || !Number.isFinite(amount)) result.unpricedRequests = 1
  else result.costs.push({ currency: price!.currency, amount, requests: 1 })
  return result
}
function add(target: UsageMetrics, source: UsageMetrics): void {
  for (const key of Object.keys(target) as (keyof UsageMetrics)[]) {
    if (key !== 'costs') target[key] += source[key]
  }
  for (const money of source.costs) {
    const total = target.costs.find(item => item.currency === money.currency)
    if (total) { total.amount += money.amount; total.requests += money.requests }
    else target.costs.push({ ...money })
  }
  target.costs.sort((a, b) => a.currency.localeCompare(b.currency))
}
function rank<T extends UsageRank>(map: Map<string, T>): T[] {
  return [...map.values()].sort((a, b) => b.metrics.totalTokens - a.metrics.totalTokens || b.metrics.requests - a.metrics.requests || a.id.localeCompare(b.id))
}
function addRank<T extends UsageRank>(map: Map<string, T>, value: Omit<T, 'metrics'>, amount: UsageMetrics): void {
  let entry = map.get(value.id)
  if (!entry) { entry = { ...value, metrics: emptyMetrics() } as T; map.set(value.id, entry) }
  add(entry.metrics, amount)
}

/** Own raw-log rows only: parent sessions never receive their children's consumption again. */
export function aggregateUsage(sessions: readonly UsageReportSession[], query: UsageQuery, prices: readonly UsagePrice[], options: { now?: number; workspaceTitles?: Map<string, string> } = {}): AggregatedUsageReport {
  const now = options.now ?? Date.now()
  // Calendar dates must not depend on the machine locale or UTC offset at a different DST date.
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: query.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const date = (at: number): string => {
    const parts = formatter.formatToParts(at)
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
  }
  const today = date(now)
  const todayDay = Date.parse(`${today}T00:00:00Z`) / dayMs
  const dateOfDay = (day: number): string => new Date(day * dayMs).toISOString().slice(0, 10)
  const periodFrom = query.days === 0 ? '' : dateOfDay(todayDay - query.days + 1)
  const byId = new Map(sessions.map(session => [session.header.id, session]))
  const workspaceOf = (session: UsageReportSession): string => {
    const visited = new Set<string>()
    let current: UsageReportSession | undefined = session
    while (current && !visited.has(current.header.id)) {
      visited.add(current.header.id)
      if (current.header.cwd !== undefined) return current.header.cwd
      if (current.header.origin !== 'subagent' || !current.header.parentSession) break
      current = byId.get(current.header.parentSession)
    }
    return ''
  }
  const priceMap = new Map(prices.map(price => [JSON.stringify([price.provider, price.model]), price]))
  const overview = { allTime: emptyMetrics(), today: emptyMetrics(), month: emptyMetrics(), period: emptyMetrics(), activeDays: 0, streak: 0, longestStreak: 0 }
  const daily = Array.from({ length: 365 }, (_, index) => ({ date: dateOfDay(todayDay - 364 + index), metrics: emptyMetrics() }))
  const dailyMap = new Map(daily.map(day => [day.date, day.metrics]))
  const providers = new Map<string, UsageRank>()
  const models = new Map<string, UsageRank>()
  const workspaces = new Map<string, UsageRank>()
  const sessionRanks = new Map<string, UsageSession>()
  const providerOptions = new Set<string>()
  const modelOptions = new Map<string, { provider: string; model: string }>()
  const workspaceOptions = new Map<string, { path: string; title: string }>()
  const workspaceTitle = (path: string): string => options.workspaceTitles?.get(path) ?? path
  for (const session of sessions) {
    const workspace = workspaceOf(session)
    const role = session.header.origin === 'subagent' ? 'subagent' : 'main'
    if (workspace) workspaceOptions.set(workspace, { path: workspace, title: workspaceTitle(workspace) })
    // Options come from all sessions, not the filtered/period-limited subset.
    for (const row of [session.state, ...session.state.rows]) {
      if (row.provider) providerOptions.add(row.provider)
      if (row.provider && row.model) modelOptions.set(JSON.stringify([row.provider, row.model]), { provider: row.provider, model: row.model })
    }
    if (query.role !== 'all' && role !== query.role || query.workspace !== undefined && query.workspace !== workspace) continue
    const updatedAt = session.state.rows.reduce((latest, row) => Math.max(latest, row.endedAt ?? row.modelEndedAt ?? row.startedAt), session.header.createdAt)
    for (const row of session.state.rows) {
      if (query.provider !== undefined && query.provider !== row.provider || query.model !== undefined && query.model !== row.model) continue
      const localDate = date(row.startedAt)
      const amount = metrics(row, priceMap)
      add(overview.allTime, amount)
      if (localDate === today) add(overview.today, amount)
      if (localDate.slice(0, 7) === today.slice(0, 7)) add(overview.month, amount)
      const gridDay = dailyMap.get(localDate)
      if (gridDay) add(gridDay, amount)
      if (query.days !== 0 && (localDate < periodFrom || localDate > today)) continue
      add(overview.period, amount)
      addRank(providers, { id: row.provider, label: row.provider || 'Unknown provider', provider: row.provider }, amount)
      addRank(models, { id: JSON.stringify([row.provider, row.model]), label: row.model || 'Unknown model', provider: row.provider, model: row.model }, amount)
      addRank(workspaces, { id: workspace, label: workspaceTitle(workspace) || 'Unknown workspace' }, amount)
      addRank(sessionRanks, { id: session.header.id, label: session.title || session.header.id, workspace, role, parentSession: session.header.parentSession ?? null, updatedAt }, amount)
    }
  }
  let run = 0
  for (const day of daily) {
    if (day.metrics.requests > 0) { overview.activeDays++; run++; overview.longestStreak = Math.max(overview.longestStreak, run) }
    else run = 0
  }
  let index = daily.length - 1
  if (daily[index]!.metrics.requests === 0) index--
  while (index >= 0 && daily[index]!.metrics.requests > 0) { overview.streak++; index-- }
  return {
    generatedAt: now, query: { ...query }, overview, daily,
    providers: rank(providers), models: rank(models), workspaces: rank(workspaces), sessions: rank(sessionRanks),
    options: {
      providers: [...providerOptions].sort(),
      models: [...modelOptions.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)),
      workspaces: [...workspaceOptions.values()].sort((a, b) => a.path.localeCompare(b.path)),
    },
    prices: prices.map(price => ({ ...price })),
  }
}
export const buildUsageReport = aggregateUsage
