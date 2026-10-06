/** Profile-local usage reporting. Logs remain authoritative; credentials never leave Account. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Domain, DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { registerAccountRoutes } from '../antigravity/account-routes.ts'
import { usageProjectionDefinition, type UsageState } from './fold.ts'
import { aggregateUsage } from './report.ts'
import type { UsageBalance, UsageBalances, UsagePrice, UsageQuery, UsageReport } from './types.ts'
import { readProviderBalances, type ProviderBalanceReaders, type BalanceProvider } from './provider-balances.ts'

const boundedString = z.string().min(1).max(4096)
export const usageQuerySchema = z.object({
  days: z.union([z.literal(0), z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).default(30),
  timezone: z.string().min(1).max(128).default('UTC').refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
  }, 'Invalid IANA timezone'),
  role: z.enum(['all', 'main', 'subagent']).default('all'),
  workspace: boundedString.optional(), provider: boundedString.optional(), model: boundedString.optional(),
}).strict()
const rate = z.number().finite().min(0).max(1_000_000)
export const usagePriceSchema = z.object({
  provider: z.string().min(1).max(256).refine(value => /^deepseek(?:$|[-_/:.])/i.test(value), 'Only DeepSeek pricing is supported'),
  model: z.string().min(1).max(256), currency: z.enum(['CNY', 'USD']),
  input: rate, output: rate, cacheRead: rate.nullable(), cacheWrite: rate.nullable(),
}).strict()
export const usagePricesSchema = z.object({ prices: z.array(usagePriceSchema).max(200) }).strict().refine(value =>
  new Set(value.prices.map(price => JSON.stringify([price.provider, price.model]))).size === value.prices.length,
'Duplicate provider/model pricing')
const clientSchema = z.object({
  version: z.string().min(1).max(128), locale: z.string().min(1).max(64),
  timezoneOffsetSeconds: z.number().int().min(-86400).max(86400),
}).strict()
const priceDomainSpec = {
  // Storage unit names must match /^[a-z][a-z0-9_]*$/; hyphens make
  // DomainFacility.open throw 'invalid unit name' and break this plugin's mount.
  name: 'provider_extension_usage_prices', version: 1,
  global: { schema: z.array(usagePriceSchema).max(200), initial: [] as UsagePrice[] }, tables: {},
} as const

// Structural faces keep the older build-time DSH types out of current log replay.
interface Header { id: string; createdAt: number; cwd?: string; parentSession?: string; origin?: 'subagent' }
interface Observation {
  header: Header; inheritedEventCount: number; cursor: number; revision?: string
  projections?: { values: Record<string, unknown> }
  [Symbol.dispose](): void
}
interface QueryService {
  listSessions(signal?: AbortSignal): Promise<{ header: Header; live: boolean; persisted: boolean }[]>
  observeSession(id: string, options: { signal: AbortSignal; projectionMode: 'all' }): Promise<Observation>
}
interface Projections {
  register(definition: unknown): () => void
  onChanged(listener: (session: { header: Header }, key: string, value: unknown, seq: number) => void): () => void
}
interface Account {
  getState(): Promise<{ status: string; links: { usageUrl: string } }>
  getBalance(client: z.infer<typeof clientSchema>): Promise<null | { status: 'failed' } | { status: 'ready'; value: UsageBalance['wallets']; bonusWallets: UsageBalance['bonusWallets'] }>
}
type SessionData = { header: Header; title: string; state: UsageState }
type PriceDomain = Domain<typeof priceDomainSpec>
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** One application operation owner, consumed equally by the page and the Agent tool. */
export class UsageController {
  private readonly sessions = new Map<string, SessionData>()
  private readonly live = new Map<string, { state: UsageState; seq: number }>()
  private errors: UsageReport['coverage']['errors'] = []
  private totalSessions = 0
  private processedSessions = 0
  private lastScan = 0
  private scan: Promise<void> | undefined
  private readonly lifetime = new AbortController()
  private prices: PriceDomain | undefined
  constructor(private readonly ctx: Context, private readonly query: QueryService, private readonly balanceReaders: () => ProviderBalanceReaders = () => ({})) {}

  setPriceDomain(domain: PriceDomain | undefined): void { this.prices = domain }
  update(session: { header: Header }, key: string, value: unknown, seq: number): void {
    if (key !== 'providerUsage' || this.lifetime.signal.aborted) return
    // Preserve an update even while the first immutable historical cut is awaiting delivery.
    this.live.set(session.header.id, { state: value as UsageState, seq })
    const previous = this.sessions.get(session.header.id)
    if (previous) this.sessions.set(session.header.id, { ...previous, state: value as UsageState })
  }
  async close(): Promise<void> {
    this.lifetime.abort()
    await this.scan
    this.sessions.clear()
    this.live.clear()
  }
  private refreshHistory(): void {
    if (this.scan || this.lifetime.signal.aborted || Date.now() - this.lastScan < 15_000) return
    const task = this.scanHistory().catch(() => {
      if (!this.lifetime.signal.aborted) this.errors = [{ sessionId: '*', reason: 'history-list-failed' }]
    }).finally(() => {
      this.lastScan = Date.now()
      if (this.scan === task) this.scan = undefined
    })
    this.scan = task
  }
  private async scanHistory(): Promise<void> {
    const records = await this.query.listSessions(this.lifetime.signal)
    if (this.lifetime.signal.aborted) return
    this.totalSessions = records.length
    this.processedSessions = 0
    this.errors = []
    const present = new Set(records.map(record => record.header.id))
    for (const id of this.sessions.keys()) if (!present.has(id)) this.sessions.delete(id)
    for (const id of this.live.keys()) if (!present.has(id)) this.live.delete(id)
    // ponytail: one replay at a time bounds memory; parallelize only if large profiles need faster import.
    for (const record of records) {
      if (this.lifetime.signal.aborted) return
      let observation: Observation | undefined
      try {
        observation = await this.query.observeSession(record.header.id, { signal: this.lifetime.signal, projectionMode: 'all' })
        if (this.lifetime.signal.aborted) return
        const value = observation.projections?.values.providerUsage
        if (!value) throw new Error('Usage projection unavailable')
        const titleProjection = observation.projections?.values.title
        const title = typeof titleProjection === 'string' ? titleProjection : record.header.id
        // Retain only the secret-free projection, never the observed raw event log.
        const latest = this.live.get(record.header.id)
        const state = latest && latest.seq > observation.cursor ? latest.state : value as UsageState
        if (latest && latest.seq <= observation.cursor) this.live.delete(record.header.id)
        this.sessions.set(record.header.id, { header: observation.header, title, state })
        this.processedSessions++
      } catch {
        if (this.lifetime.signal.aborted) return
        // A changed/unreadable log must not keep serving its older cached totals.
        this.sessions.delete(record.header.id)
        this.errors.push({ sessionId: record.header.id, reason: 'session-read-failed' })
      } finally { observation?.[Symbol.dispose]() }
    }
  }
  report(raw: unknown): UsageReport {
    const parsed = usageQuerySchema.parse(raw)
    const query: UsageQuery = { days: parsed.days, timezone: parsed.timezone, role: parsed.role,
      ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace }),
      ...(parsed.provider === undefined ? {} : { provider: parsed.provider }),
      ...(parsed.model === undefined ? {} : { model: parsed.model }) }
    this.refreshHistory()
    const data = [...this.sessions.values()]
    const registry = this.ctx.get('workspaceRegistry') as { list(): { path: string; title: string }[] } | undefined
    const report = aggregateUsage(data, query, this.prices?.global.get() ?? [], {
      workspaceTitles: new Map(registry?.list().map(workspace => [workspace.path, workspace.title])),
    })
    return {
      ...report,
      priceStorage: this.prices !== undefined,
      coverage: {
        totalSessions: this.totalSessions, processedSessions: this.processedSessions,
        failedSessions: this.errors.length, inheritedEventsExcluded: data.reduce((sum, item) => sum + item.state.inheritedEventCount, 0),
        loading: this.scan !== undefined, from: data.length ? data.reduce((oldest, item) => Math.min(oldest, item.header.createdAt), Infinity) : null,
        errors: this.errors.slice(0, 20),
      },
    }
  }
  async savePrices(raw: unknown): Promise<{ prices: UsagePrice[] }> {
    const { prices } = usagePricesSchema.parse(raw)
    if (!this.prices) throw new Error('Price storage unavailable')
    await this.prices.global.set(prices)
    return { prices: this.prices.global.get() }
  }
  async balances(raw: unknown, caller?: AbortSignal): Promise<UsageBalances> {
    const client = clientSchema.parse(raw)
    const signal = caller ? AbortSignal.any([caller, this.lifetime.signal]) : this.lifetime.signal
    signal.throwIfAborted()
    const registry = this.ctx.get('llm') as { listProviders(): BalanceProvider[] } | undefined
    const [deepseek, providers] = await Promise.all([this.balance(client), readProviderBalances(registry?.listProviders() ?? [], this.balanceReaders(), signal)])
    signal.throwIfAborted()
    return { deepseek, providers }
  }
  async balance(raw: unknown): Promise<UsageBalance> {
    const client = clientSchema.parse(raw)
    const empty = { wallets: [], bonusWallets: [], checkedAt: Date.now(), usageUrl: null }
    const account = this.ctx.get('deepseekAccount') as Account | undefined
    if (!account) return { ...empty, status: 'unavailable' }
    try {
      const state = await account.getState()
      const url = new URL(state.links.usageUrl)
      const usageUrl = url.protocol === 'https:' && !url.username && !url.password ? url.href : null
      if (state.status !== 'credential-stored') return { ...empty, usageUrl, status: 'signed-out' }
      const balance = await account.getBalance(client)
      if (balance === null) return { ...empty, usageUrl, status: 'signed-out' }
      if (balance.status !== 'ready') return { ...empty, usageUrl, status: 'failed' }
      return { status: 'ready', wallets: balance.value, bonusWallets: balance.bonusWallets, checkedAt: Date.now(), usageUrl }
    } catch { return { ...empty, status: 'failed' } }
  }
}

const toolParameters = {
  type: 'object', properties: {
    action: { type: 'string', enum: ['report', 'balance', 'balances', 'set_prices'], description: 'report reads usage; balance reads the DeepSeek wallet; balances reads all registered channels’ provider-reported account balances/quotas without switching accounts; set_prices replaces DeepSeek estimation rates.' },
    query: { type: 'object', properties: {
      days: { type: 'integer', enum: [0, 7, 30, 90, 365], description: 'Default 30; 0 includes all dates.' },
      timezone: { type: 'string', description: 'IANA timezone, default UTC.' },
      role: { type: 'string', enum: ['all', 'main', 'subagent'] },
      workspace: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' },
    }, additionalProperties: false },
    prices: { type: 'array', maxItems: 200, description: 'Required for set_prices. Full replacement; [] clears rates. Prices per million tokens, not actual billing.', items: {
      type: 'object', properties: {
        provider: { type: 'string' }, model: { type: 'string' }, currency: { type: 'string', enum: ['CNY', 'USD'] },
        input: { type: 'number', minimum: 0 }, output: { type: 'number', minimum: 0 },
        cacheRead: { type: ['number', 'null'], minimum: 0 }, cacheWrite: { type: ['number', 'null'], minimum: 0 },
      }, required: ['provider', 'model', 'currency', 'input', 'output', 'cacheRead', 'cacheWrite'], additionalProperties: false,
    } },
  }, required: ['action'], additionalProperties: false,
} as const
export function createUsageTool(controller: UsageController): ToolDefinition {
  return {
    name: 'usage_statistics', description: 'Read profile-wide usage, coverage and provider-reported balances/quotas, or configure DeepSeek cost estimates. Unsupported or unavailable quota is explicit; subscription credits are not currency. Returns bounded rankings.',
    parameters: toolParameters as unknown as Record<string, unknown>,
    isConcurrencySafe: args => isRecord(args) && args.action !== 'set_prices',
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async args => {
      const request = z.object({ action: z.enum(['report', 'balance', 'balances', 'set_prices']), query: usageQuerySchema.optional(), prices: z.array(usagePriceSchema).max(200).optional() }).strict().parse(args)
      if (request.action === 'balance') return controller.balance({ version: 'dsh-provider-extension/0.8.0', locale: 'zh-CN', timezoneOffsetSeconds: 0 })
      if (request.action === 'balances') return controller.balances({ version: 'dsh-provider-extension/0.8.0', locale: 'zh-CN', timezoneOffsetSeconds: 0 })
      if (request.action === 'set_prices') {
        if (!request.prices) throw new Error('prices is required for set_prices')
        return controller.savePrices({ prices: request.prices })
      }
      const report = controller.report(request.query ?? {})
      return { generatedAt: report.generatedAt, query: report.query, overview: report.overview, coverage: report.coverage,
        providers: report.providers.slice(0, 10), models: report.models.slice(0, 10), workspaces: report.workspaces.slice(0, 10), sessions: report.sessions.slice(0, 10) }
    },
  }
}

export function applyUsage(ctx: Context, balanceReaders: () => ProviderBalanceReaders = () => ({})): void {
  ctx.inject(['sessionQuery', 'sessionProjections', 'connection'], scope => {
    const projections = scope.get('sessionProjections') as Projections
    scope.effect(() => projections.register(usageProjectionDefinition), 'usage: projection')
    const controller = new UsageController(scope, scope.get('sessionQuery') as QueryService, balanceReaders)
    scope.effect(() => scope.provide('providerUsage', controller), 'usage: application operations')
    scope.effect(() => projections.onChanged((session, key, value, seq) => controller.update(session, key, value, seq)), 'usage: live updates')
    scope.effect(() => () => controller.close(), 'usage: historical read lifetime')
    scope.inject(['storageDomain'], async storageScope => {
      let active = true
      let domain: PriceDomain | undefined
      storageScope.effect(() => async () => {
        active = false
        controller.setPriceDomain(undefined)
        await domain?.close()
      }, 'usage: price storage')
      domain = await (storageScope.get('storageDomain') as DomainFacility).open(priceDomainSpec)
      if (!active) { await domain.close(); return }
      controller.setPriceDomain(domain)
    })
    scope.effect(() => registerAccountRoutes(scope.get('connection')!, 'usage', ['report', 'balance', 'balances', 'prices'], async (endpoint, raw, signal) => {
      try {
        const value = endpoint === 'report' ? controller.report(raw) : endpoint === 'balance' ? await controller.balance(raw) : endpoint === 'balances' ? await controller.balances(raw, signal) : await controller.savePrices(raw)
        return { ok: true, value }
      } catch (error) {
        return { ok: false, error: { code: error instanceof z.ZodError ? 'invalid-usage-request' : 'usage-unavailable',
          message: error instanceof z.ZodError ? 'Invalid usage filters or pricing' : 'Usage operation unavailable; check history and storage capabilities', details: {} } }
      }
    }), 'usage: authenticated routes')
    scope.inject(['tools'], toolsScope => { toolsScope.tools.register(createUsageTool(controller)) })
  })
}
