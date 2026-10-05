import { describe, expect, it } from 'vitest'
import { UsageController, usageQuerySchema, usagePricesSchema, createUsageTool } from '../src/usage/index.ts'
import { initUsage, applyUsage } from '../src/usage/fold.ts'
import type { Context } from '@deepseek-ai/cordis'

const header = { id: 'root', createdAt: Date.UTC(2026, 9, 3), cwd: 'C:\\project' }
const state = applyUsage(initUsage(header), { type: 'step/start', seq: 0, time: header.createdAt, data: { turn: 1, step: 1 } })
const client = { version: '0.6.0', locale: 'zh-CN', timezoneOffsetSeconds: 28800 }
const context = (services: Record<string, unknown>): Context => ({ get: (name: string) => services[name] }) as unknown as Context
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

describe('usage trust boundaries and lifecycle', () => {
  it('validates timezone, bounded filters, separate currencies and price targets', () => {
    expect(usageQuerySchema.parse({})).toEqual({ days: 30, timezone: 'UTC', role: 'all' })
    expect(() => usageQuerySchema.parse({ timezone: 'not/a/timezone' })).toThrow()
    expect(() => usageQuerySchema.parse({ days: 3 })).toThrow()
    expect(() => usageQuerySchema.parse({ arbitrary: true })).toThrow()
    const price = { provider: 'deepseek-account', model: 'm', currency: 'CNY', input: 2, output: 3, cacheRead: null, cacheWrite: 0 }
    expect(usagePricesSchema.parse({ prices: [price] }).prices).toHaveLength(1)
    expect(() => usagePricesSchema.parse({ prices: [price, price] })).toThrow()
    expect(() => usagePricesSchema.parse({ prices: [{ ...price, provider: 'opencode' }] })).toThrow()
    expect(() => usagePricesSchema.parse({ prices: [{ ...price, input: -1 }] })).toThrow()
    expect(() => usagePricesSchema.parse({ prices: [{ ...price, currency: 'EUR' }] })).toThrow()
  })
  it('imports exact projections, releases leases and applies live updates', async () => {
    let disposed = 0
    const controller = new UsageController(context({}), {
      listSessions: async () => [{ header, live: false, persisted: true }],
      observeSession: async () => ({ header, inheritedEventCount: 0, cursor: 0,
        projections: { values: { providerUsage: state, title: 'Example' } },
        [Symbol.dispose]: () => { disposed++ } }),
    })
    expect(controller.report({}).coverage.loading).toBe(true)
    await flush()
    const report = controller.report({ days: 0 })
    expect(report.coverage).toMatchObject({ totalSessions: 1, processedSessions: 1, failedSessions: 0, loading: false })
    expect(report.sessions[0]?.label).toBe('Example')
    expect(report.overview.allTime.requests).toBe(1)
    expect(disposed).toBe(1)
    controller.update({ header }, 'providerUsage', { ...state, rows: [] }, 1)
    expect(controller.report({}).overview.allTime.requests).toBe(0)
    await controller.close()
  })
  it('does not overwrite a newer live watermark with an older awaited historical cut', async () => {
    let release!: (value: any) => void
    let disposed = 0
    const controller = new UsageController(context({}), {
      listSessions: async () => [{ header, live: true, persisted: true }],
      observeSession: () => new Promise(resolve => { release = resolve }),
    })
    controller.report({}); await flush()
    const newer = applyUsage(state, { type: 'step/start', seq: 1, time: header.createdAt + 1, data: { turn: 1, step: 2 } })
    controller.update({ header }, 'providerUsage', newer, 1)
    release({ header, inheritedEventCount: 0, cursor: 0, projections: { values: { providerUsage: state } }, [Symbol.dispose]: () => { disposed++ } })
    await flush()
    expect(controller.report({}).overview.allTime.requests).toBe(2)
    expect(disposed).toBe(1)
    await controller.close()
  })
  it('shows unreadable history rather than claiming an empty successful import', async () => {
    const controller = new UsageController(context({}), {
      listSessions: async () => [{ header, live: false, persisted: true }],
      observeSession: async () => { throw new Error('sensitive content must not be returned') },
    })
    controller.report({}); await flush()
    expect(controller.report({}).coverage).toMatchObject({ processedSessions: 0, failedSessions: 1, errors: [{ sessionId: 'root', reason: 'session-read-failed' }] })
    expect(JSON.stringify(controller.report({}))).not.toContain('sensitive content')
    await controller.close()
  })
  it('captures corpus listing failure', async () => {
    const controller = new UsageController(context({}), {
      listSessions: async () => { throw new Error('private path') }, observeSession: async () => { throw new Error() },
    })
    controller.report({}); await flush()
    expect(controller.report({}).coverage.errors).toEqual([{ sessionId: '*', reason: 'history-list-failed' }])
    await controller.close()
  })
  it('reuses the logged-in account balance without returning account credentials', async () => {
    let called = 0
    const controller = new UsageController(context({ deepseekAccount: {
      getState: async () => ({ status: 'credential-stored', links: { usageUrl: 'https://platform.deepseek.com/usage' } }),
      getBalance: async (metadata: unknown) => {
        expect(metadata).toEqual(client); called++
        return { status: 'ready', value: [{ currency: 'CNY', balance: '9.97' }], bonusWallets: [{ currency: 'CNY', balance: '5.61' }] }
      },
    } }), { listSessions: async () => [], observeSession: async () => { throw new Error() } })
    const balance = await controller.balance(client)
    expect(balance).toMatchObject({ status: 'ready', wallets: [{ currency: 'CNY', balance: '9.97' }], bonusWallets: [{ currency: 'CNY', balance: '5.61' }] })
    expect(called).toBe(1)
    expect(Object.keys(balance)).not.toContain('token')
    await controller.close()
  })
  it('page and Agent balances share provider reads and preserve legacy DeepSeek balance', async () => {
    const controller = new UsageController(context({ llm: { listProviders: () => [{ id: 'openai-codex', name: 'OpenAI Codex' }, { id: 'custom', name: 'Custom' }] } }), { listSessions: async () => [], observeSession: async () => { throw new Error() } }, () => ({ codex: { call: async endpoint => ({ ok: true, value: endpoint === 'status' ? { accounts: [{ id: 'work', active: true }] } : { rateLimits: [{ id: 'codex', windows: [{ remainingPercent: 80, windowSeconds: 18_000 }] }] } }) } }))
    const page = await controller.balances(client)
    const tool = await createUsageTool(controller).execute({ action: 'balances' }, {} as never) as typeof page
    expect(page.deepseek.status).toBe('unavailable')
    expect(page.providers.map(row => [row.provider, row.status, row.windows])).toEqual(tool.providers.map(row => [row.provider, row.status, row.windows]))
    expect(page.providers[0]?.windows[0]?.percent).toBe(80)
    expect(page.providers[1]?.status).toBe('unsupported')
    expect((await controller.balance(client)).wallets).toEqual([])
    await expect(controller.balances({ ...client, extra: 'SECRET' })).rejects.toThrow()
    await controller.close()
  })
  it('does not query a signed-out account', async () => {
    const controller = new UsageController(context({ deepseekAccount: {
      getState: async () => ({ status: 'signed-out', links: { usageUrl: 'https://platform.deepseek.com/usage' } }),
      getBalance: async () => { throw new Error('must not query') },
    } }), { listSessions: async () => [], observeSession: async () => { throw new Error() } })
    expect((await controller.balance(client)).status).toBe('signed-out')
    await controller.close()
  })
  it('UI and Agent price changes share the same persistent operation', async () => {
    const controller = new UsageController(context({}), { listSessions: async () => [], observeSession: async () => { throw new Error() } })
    let saved: unknown[] = []
    controller.setPriceDomain({ global: { get: () => saved, set: async (value: unknown[]) => { saved = value } } } as never)
    const price = { provider: 'deepseek', model: 'm', currency: 'USD', input: 0.2, output: 0.4, cacheRead: null, cacheWrite: 0 }
    const tool = createUsageTool(controller)
    const value = await tool.execute({ action: 'set_prices', prices: [price] }, {} as never)
    expect(value).toEqual({ prices: [price] })
    expect(controller.report({}).prices).toEqual([price])
    await controller.savePrices({ prices: [] })
    expect(controller.report({}).prices).toEqual([])
    await controller.close()
  })
})
