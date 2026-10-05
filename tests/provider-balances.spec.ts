import { describe, expect, it, vi } from 'vitest'
import { readProviderBalances } from '../src/usage/provider-balances.ts'
import { readCodexAccountUsage } from '../src/codex/account-usage.ts'
import { readFileSync } from 'node:fs'
import { createQuotaService, readFreshQuota } from '../src/antigravity/quota.ts'

const signal = () => new AbortController().signal
const codexProvider = { id: 'openai-codex', name: 'ChatGPT subscription' }
const quota = (remainingPercent: number) => ({ rateLimits: [{ id: 'codex', windows: [{ windowSeconds: 18_000, remainingPercent, resetsAt: 1_800_000_000 }, { windowSeconds: 604_800, remainingPercent: 92 }] }], credits: { unlimited: false, balance: '5.50' }, resetCredits: { availableCount: 3 } })

const codexSource = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')

describe('real provider balance projections', () => {
  it('reads each Codex account directly, does not select accounts, and excludes secrets/unknown currency', async () => {
    const call = vi.fn(async (endpoint: string, payload: any) => ({ ok: true, value: endpoint === 'status'
      ? { accounts: [{ id: 'work', label: 'Work', active: true, planType: 'PLUS', accessToken: 'SECRET' }, { id: 'other', email: 'personal@example.com', active: false }] }
      : { ...quota(payload.id === 'work' ? 84 : 12), refreshToken: 'SECRET' } }))
    const rows = await readProviderBalances([codexProvider], { codex: { call } }, signal())
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'OpenAI Codex', accountId: 'work', active: true, plan: 'PLUS', status: 'ready', credits: '5.50', resetCredits: 3, windows: [{ window: '5h', percent: 84, kind: 'remaining', resetsAt: 1_800_000_000_000 }, { window: 'weekly', percent: 92 }] })
    expect(rows[1]).toMatchObject({ accountId: 'other', label: 'pe***@example.com', windows: [{ percent: 12 }, { percent: 92 }] })
    expect(call.mock.calls.map(args => args[0])).toEqual(['status', 'usage', 'usage'])
    expect(call.mock.calls.slice(1).map(args => args[1])).toEqual([{ id: 'work', force: true }, { id: 'other', force: true }])
    expect(JSON.stringify(rows)).not.toMatch(/SECRET|currency|personal@example.com/)
  })
  it('normalizes only our Codex route to the settings name, including failed/signed-out rows', async () => {
    const provider = { id: 'openai-codex', name: 'ChatGPT subscription' }
    const signedOut = await readProviderBalances([provider], { codex: { call: async () => ({ ok: true, value: { accounts: [] } }) } }, signal())
    expect(signedOut[0]).toMatchObject({ name: 'OpenAI Codex', label: 'OpenAI Codex', status: 'signed-out' })
    const failed = await readProviderBalances([provider], { codex: { call: async () => { throw new Error('offline') } } }, signal())
    expect(failed[0]).toMatchObject({ name: 'OpenAI Codex', status: 'failed' })
    const other = await readProviderBalances([{ id: 'openai-codex-other', name: 'Custom subscription' }], {}, signal())
    expect(other[0]).toMatchObject({ name: 'Custom subscription', status: 'unsupported' })
  })
  it('does not invent full quota when provider windows are missing, invalid or fail', async () => {
    const call = vi.fn(async (endpoint: string, payload: any) => endpoint === 'status' ? { ok: true, value: { accounts: [{ id: 'none' }, { id: 'bad' }, { id: 'failed' }] } }
      : payload.id === 'failed' ? { ok: false } : { ok: true, value: payload.id === 'bad' ? quota(150) : { rateLimits: [] } })
    const rows = await readProviderBalances([codexProvider], { codex: { call } }, signal())
    expect(rows[0]).toMatchObject({ status: 'unavailable', windows: [], credits: null })
    expect(rows[1]?.windows.every(window => window.percent <= 100)).toBe(true)
    expect(rows[2]).toMatchObject({ status: 'failed', windows: [] })
  })
  it('reads both Antigravity accounts by ID and keeps their quotas separate', async () => {
    const accounts = vi.fn(async () => [{ id: 'google', label: 'Google', active: true, tier: 'Pro' }, { id: 'second', label: 'Second', active: false }])
    const usageForAccount = vi.fn(async (id: string) => ({ state: 'available' as const, checkedAt: '2026-10-04T12:00:00Z', groups: [{ group: 'gemini' as const, modelCount: 4, windows: [{ window: '5h' as const, remainingFraction: id === 'google' ? 0.7 : 0.2, resetTime: '2026-10-04T15:00:00Z' }] }] }))
    const request = signal()
    const rows = await readProviderBalances([{ id: 'google-antigravity', name: 'Antigravity' }], { antigravity: { accounts, usageForAccount } }, request)
    expect(rows[0]).toMatchObject({ active: true, status: 'ready', plan: null, windows: [{ group: 'gemini', percent: 70, kind: 'remaining' }] })
    expect(rows[1]).toMatchObject({ accountId: 'second', active: false, status: 'ready', windows: [{ percent: 20 }] })
    expect(usageForAccount.mock.calls).toEqual([['google', request], ['second', request]])
    expect(accounts).toHaveBeenCalledTimes(1)
  })
  it('fresh Antigravity reads cannot share a previous account’s in-flight quota', async () => {
    let active = 'old'
    let resolveOld!: (response: Response) => void
    const oldResponse = new Promise<Response>(resolve => { resolveOld = resolve })
    const response = (fraction: number) => new Response(JSON.stringify({ groups: [{ group: 'gemini', modelCount: 1, windows: [{ window: '5h', remainingFraction: fraction, resetTime: '2026-10-04T15:00:00Z' }] }] }))
    const request = vi.fn(async (input: { accessToken: string }) => input.accessToken === 'old' ? oldResponse : response(0.2))
    const options = { auth: { credential: async () => ({ accessToken: active, refreshToken: 'test', expiresAt: 1_800_000_000_000, projectId: 'project' }) }, transport: { request }, now: () => Date.parse('2026-10-04T12:00:00Z') }
    const legacy = createQuotaService(options)
    const pending = legacy.refresh(undefined, true)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(request).toHaveBeenCalledOnce()
    active = 'new'
    const fresh = await readFreshQuota(options)
    expect(fresh.groups?.[0]?.windows[0]?.remainingFraction).toBe(0.2)
    resolveOld(response(0.8))
    expect((await pending).groups?.[0]?.windows[0]?.remainingFraction).toBe(0.8)
    expect(request).toHaveBeenCalledTimes(2)
    await legacy.dispose()
    expect(readFileSync(new URL('../src/antigravity/index.ts', import.meta.url), 'utf8')).toContain('usageForAccount: (id, signal) => service.usageForAccount(id, signal)')
  })
  it('isolates an Antigravity account failure without hiding another account quota', async () => {
    const accounts = async () => [{ id: 'a', label: 'A', active: true }, { id: 'b', label: 'B', active: false }]
    const rows = await readProviderBalances([{ id: 'google-antigravity', name: 'Antigravity' }], { antigravity: { accounts, usageForAccount: async id => {
      if (id === 'a') throw new Error('SECRET')
      return { state: 'available', groups: [{ group: 'gemini', modelCount: 1, windows: [{ window: '5h', remainingFraction: 0.5, resetTime: '2026-10-04T15:00:00Z' }] }] }
    } } }, signal())
    expect(rows[0]).toMatchObject({ status: 'failed', windows: [] })
    expect(rows[1]).toMatchObject({ accountId: 'b', status: 'ready', windows: [{ percent: 50 }] })
    expect(JSON.stringify(rows)).not.toContain('SECRET')
  })
  it('uses the Host OpenCode reader and labels percent as reported, never guesses remaining or cash', async () => {
    const readUsage = vi.fn(async () => ({ rolling: { status: 'ok', percent: 15, resetsAt: '2026-10-04T15:00:00Z' }, weekly: { status: 'rate-limited', percent: 120, resetsAt: '2026-10-10T15:00:00Z' }, monthly: { status: 'ok', percent: 25, resetsAt: '2026-11-01T00:00:00Z' }, apiKey: 'SECRET' }))
    const rows = await readProviderBalances([{ id: 'opencode-go', name: 'OpenCode Go' }], { opencode: { readUsage } }, signal())
    expect(readUsage).toHaveBeenCalledOnce()
    expect(rows[0]).toMatchObject({ status: 'ready', windows: [{ window: 'rolling', percent: 15, kind: 'reported' }, { window: 'weekly', percent: 120, limited: true }, { window: 'monthly', percent: 25 }] })
    expect(JSON.stringify(rows)).not.toMatch(/SECRET|apiKey|currency/)
  })
  it('isolates provider failures and reports unsupported channels instead of a zero balance', async () => {
    const rows = await readProviderBalances([{ id: 'deepseek-account', name: 'DeepSeek' }, codexProvider, { id: 'custom', name: 'Custom' }], { codex: { call: async () => { throw new Error('SECRET') } } }, signal())
    expect(rows.map(row => row.status)).toEqual(['failed', 'unsupported'])
    expect(JSON.stringify(rows)).not.toContain('SECRET')
  })
  it('does not assume similarly named external routes share our credentials', async () => {
    const call = vi.fn(async () => ({ ok: true, value: {} }))
    const rows = await readProviderBalances([{ id: 'openai-codex-other', name: 'Other' }], { codex: { call } }, signal())
    expect(rows[0]?.status).toBe('unsupported')
    expect(call).not.toHaveBeenCalled()
  })
  it('honors cancellation even when a provider does not accept a signal', async () => {
    const controller = new AbortController()
    const result = readProviderBalances([{ id: 'opencode-go', name: 'OpenCode Go' }], { opencode: { readUsage: async () => { controller.abort(); return {} } } }, controller.signal)
    await expect(result).rejects.toThrow()
  })
  it.each(['missing', 'no-account-id', 'unauthorized', 'offline'])('Codex account-specific %s fails closed instead of returning another account quota', async failure => {
    const request = readCodexAccountUsage('target', { getAuth: async () => ({ auth: { apiKey: 'opaque' } }), readCredential: async () => failure === 'missing' ? undefined : failure === 'no-account-id' ? { access: 'opaque' } : { access: 'opaque', accountId: 'requested' },
      resolveAccountId: credential => credential.accountId, fetch: async () => new Response('{}', { status: failure === 'unauthorized' ? 401 : 503 }), parse: value => value, url: 'https://chatgpt.com/backend-api/wham/usage', userAgent: 'test', timeoutMs: 15000 }, signal())
    await expect(request).rejects.toThrow()
    expect(codexSource).toContain('if (payload != null && Object.hasOwn(payload, "id"))')
  })
  it('Codex targeted requests use that account’s credentials and return only the parser projection', async () => {
    const fetchQuota = vi.fn(async () => new Response(JSON.stringify({ rawQuota: 84, secret: 'SECRET' }), { status: 200 }))
    const readCredential = vi.fn(async () => ({ access: 'opaque', accountId: 'target' }))
    const result = await readCodexAccountUsage('local-id', { getAuth: async () => ({ auth: { apiKey: 'opaque' } }), readCredential, resolveAccountId: credential => credential.accountId, fetch: fetchQuota,
      parse: value => ({ percent: (value as { rawQuota: number }).rawQuota }), url: 'https://chatgpt.com/backend-api/wham/usage', userAgent: 'test', timeoutMs: 15000 }, signal())
    expect(result).toEqual({ percent: 84 })
    expect(readCredential).toHaveBeenCalledExactlyOnceWith('local-id')
    expect(fetchQuota).toHaveBeenCalledExactlyOnceWith('https://chatgpt.com/backend-api/wham/usage', expect.objectContaining({ headers: expect.objectContaining({ 'chatgpt-account-id': 'target' }), redirect: 'error' }))
  })
})
