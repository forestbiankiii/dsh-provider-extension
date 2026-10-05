/** Read provider-owned public projections; never switch accounts or expose credentials. */
import type { CodexBalanceReader } from '../codex/index.js'
import type { OpenCodeBalanceReader } from '../opencode/index.js'
import type { AntigravityAccountView } from '../antigravity/auth-service.ts'
import type { QuotaStatusView } from '../antigravity/quota.ts'
import type { UsageProviderBalance, UsageQuotaWindow } from './types.ts'

export interface ProviderBalanceReaders {
  codex?: CodexBalanceReader
  antigravity?: { accounts(): Promise<readonly AntigravityAccountView[]>; usageForAccount(id: string, signal?: AbortSignal): Promise<QuotaStatusView> }
  opencode?: OpenCodeBalanceReader
}
export interface BalanceProvider { id: string; name: string }
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const text = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value.slice(0, 256) : null
const decimal = (value: unknown): string | null => typeof value === 'string' && value.length <= 128 && /^-?\d+(?:\.\d+)?$/.test(value) ? value : null
const time = (value: unknown): number | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null
const percent = (value: unknown, max = 100): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
const secondsTime = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value * 1000).getTime()) ? value * 1000 : null
// Subscription deadlines arrive as ISO strings or epoch seconds/milliseconds depending on the account payload.
const deadline = (value: unknown): number | null => {
  const iso = time(value)
  if (iso !== null) return iso
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^\d{9,13}$/.test(value) ? Number(value) : NaN
  return Number.isFinite(numeric) && numeric > 0 ? numeric > 1e12 ? numeric : numeric * 1000 : null
}
const mask = (value: string): string => value.replace(/([^\s@]{1,2})[^\s@]*@([^\s@]+)/g, '$1***@$2')
// Only these exact routes belong to our readers; a similarly named external adapter may use different credentials.
const family = (id: string): 'codex' | 'antigravity' | 'opencode' | null => id === 'openai-codex' ? 'codex' : id === 'google-antigravity' ? 'antigravity' : id === 'opencode-go' ? 'opencode' : null
function base(provider: BalanceProvider, account?: Record<string, unknown>): UsageProviderBalance {
  const name = provider.id === 'openai-codex' ? 'OpenAI Codex' : provider.name
  return { provider: provider.id, name, accountId: text(account?.id), label: mask(text(account?.label) ?? text(account?.email) ?? name),
    active: account?.active === true, plan: text(account?.planType) ?? text(account?.tier), subscriptionUntil: deadline(account?.subscriptionUntil), status: 'unavailable', checkedAt: Date.now(), windows: [], credits: null, unlimitedCredits: false, resetCredits: null }
}
async function unwrap(reader: CodexBalanceReader, endpoint: 'status' | 'usage', payload: unknown, signal: AbortSignal): Promise<Record<string, unknown>> {
  const result = await reader.call(endpoint, payload, signal)
  const value = record(result.value)
  if (!result.ok || !value) throw new Error('Provider quota unavailable')
  return value
}
function codexWindows(value: Record<string, unknown>): UsageQuotaWindow[] {
  const limits = Array.isArray(value.rateLimits) ? value.rateLimits.map(record) : []
  const quota = limits.find(limit => limit?.id === 'codex')
  const rows: UsageQuotaWindow[] = []
  for (const raw of Array.isArray(quota?.windows) ? quota.windows : []) {
    const window = record(raw)
    if (!window || !percent(window.remainingPercent)) continue
    const duration = window.windowSeconds
    const kind = duration === 18_000 ? '5h' : duration === 604_800 ? 'weekly' : undefined
    if (kind && !rows.some(row => row.window === kind)) rows.push({ window: kind, percent: window.remainingPercent, kind: 'remaining', resetsAt: secondsTime(window.resetsAt) })
  }
  return rows
}
async function codex(provider: BalanceProvider, reader: CodexBalanceReader, signal: AbortSignal): Promise<UsageProviderBalance[]> {
  const status = await unwrap(reader, 'status', {}, signal)
  if (!Array.isArray(status.accounts)) throw new Error('Invalid account roster')
  const accounts = status.accounts.map(record).filter((account): account is Record<string, unknown> => account !== undefined && typeof account.id === 'string')
  if (!accounts.length) return [{ ...base(provider), status: 'signed-out' }]
  const results: UsageProviderBalance[] = []
  // ponytail: batches of three bound provider requests without a scheduler dependency.
  for (let i = 0; i < accounts.length; i += 3) {
    signal.throwIfAborted()
    results.push(...await Promise.all(accounts.slice(i, i + 3).map(async account => {
      const row = base(provider, account)
      try {
        const usage = await unwrap(reader, 'usage', { id: account.id, force: true }, signal)
        const credits = record(usage.credits)
        const resets = record(usage.resetCredits)
        row.windows = codexWindows(usage)
        row.credits = decimal(credits?.balance)
        row.unlimitedCredits = credits?.unlimited === true
        row.resetCredits = typeof resets?.availableCount === 'number' && Number.isSafeInteger(resets.availableCount) && resets.availableCount >= 0 ? resets.availableCount : null
        row.status = row.windows.length || row.credits !== null || row.unlimitedCredits || row.resetCredits !== null ? 'ready' : 'unavailable'
      } catch { signal.throwIfAborted(); row.status = 'failed' }
      row.checkedAt = Date.now()
      return row
    })))
  }
  return results
}
async function antigravity(provider: BalanceProvider, reader: NonNullable<ProviderBalanceReaders['antigravity']>, signal: AbortSignal): Promise<UsageProviderBalance[]> {
  const accounts = await reader.accounts()
  if (!accounts.length) return [{ ...base(provider), status: 'signed-out' }]
  return await Promise.all(accounts.map(async account => {
    // accounts() has a legacy "Pro" default; do not present it as a verified plan.
    const row = base(provider, { id: account.id, label: account.label, email: account.email, active: account.active })
    try {
      const usage = await reader.usageForAccount(account.id, signal)
      signal.throwIfAborted()
      row.checkedAt = time(usage.checkedAt) ?? Date.now()
      if (usage.state !== 'available') { row.status = usage.state === 'unauthenticated' ? 'signed-out' : 'failed'; return row }
      for (const group of usage.groups ?? []) for (const window of group.windows) {
        if (percent(window.remainingFraction, 1)) row.windows.push({ window: window.window, group: group.group, percent: window.remainingFraction * 100, kind: 'remaining', resetsAt: time(window.resetTime) })
      }
      row.status = row.windows.length ? 'ready' : 'unavailable'
    } catch { signal.throwIfAborted(); row.status = 'failed' }
    return row
  }))
}
async function opencode(provider: BalanceProvider, reader: OpenCodeBalanceReader, signal: AbortSignal): Promise<UsageProviderBalance[]> {
  const row = base(provider)
  const usage = record(await reader.readUsage())
  signal.throwIfAborted()
  for (const kind of ['rolling', 'weekly', 'monthly'] as const) {
    const window = record(usage?.[kind])
    // The protocol says "percent", not "remaining". Do not invent a complement.
    if (window && percent(window.percent, Number.MAX_VALUE)) row.windows.push({ window: kind, percent: window.percent, kind: 'reported', resetsAt: time(window.resetsAt), limited: window.status === 'rate-limited' })
  }
  row.status = row.windows.length ? 'ready' : 'unavailable'
  row.checkedAt = Date.now()
  return [row]
}
export async function readProviderBalances(providers: readonly BalanceProvider[], readers: ProviderBalanceReaders, signal: AbortSignal): Promise<UsageProviderBalance[]> {
  const selected = providers.filter(provider => !/^deepseek(?:$|[-_/:.])/i.test(provider.id))
  const results = await Promise.all(selected.map(async provider => {
    signal.throwIfAborted()
    const kind = family(provider.id)
    try {
      if (kind === 'codex' && readers.codex) return await codex(provider, readers.codex, signal)
      if (kind === 'antigravity' && readers.antigravity) return await antigravity(provider, readers.antigravity, signal)
      if (kind === 'opencode' && readers.opencode) return await opencode(provider, readers.opencode, signal)
      return [{ ...base(provider), status: 'unsupported' as const }]
    } catch { signal.throwIfAborted(); return [{ ...base(provider), status: 'failed' as const }] }
  }))
  return results.flat()
}
