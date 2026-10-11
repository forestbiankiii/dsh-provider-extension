import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = (name: string) => source.split(`//#region src/${name}.js\n`)[1]!.split('//#endregion')[0]!
const { createService, createRpc } = new Function('randomUUID', 'USER_AGENT', 'decodeJwtPayload', `${region('reset-credits')}\n${region('subscription-rpc')}\nreturn { createService: createCodexResetCreditService, createRpc: createSubscriptionRpcHandler }`)(randomUUID, 'test', () => undefined)
const signal = () => new AbortController().signal
const start = Date.parse('2026-10-11T10:00:00Z')
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(start)
  const getAccountAuth = vi.fn(async (id: string) => {
    if (!['a', 'b'].includes(id)) throw Error('ChatGPT subscription is not signed in')
    return { auth: { apiKey: `test-access-${id}` } }
  })
  const accountVault = { readById: vi.fn(async (id: string) => ({ type: 'oauth', accountId: `provider-${id}`, access: `test-access-${id}` })) }
  const fetch = vi.fn(async (_input: string, init: RequestInit) => {
    const account = (init.headers as Record<string, string>)['chatgpt-account-id']!
    expect(init.headers).toMatchObject({ authorization: `Bearer test-access-${account.slice(-1)}` })
    if (init.method === 'POST') return new Response(JSON.stringify({ code: 'reset', windows_reset: ['primary'] }))
    return new Response(JSON.stringify({ available_count: 3, credits: [
      { id: `${account}-later`, status: 'available', expires_at: (start + 7200000) / 1000, title: 'Later' },
      { id: `${account}-soon`, status: 'available', expires_at: new Date(start + 3600000).toISOString(), title: 'Soon' },
      { id: `${account}-unknown`, status: 'available' },
      { id: 'expired', status: 'available', expires_at: (start - 1000) / 1000 },
      { id: 'used', status: 'redeemed', expires_at: (start + 1800000) / 1000 },
    ] }))
  })
  const usageReader = { clear: vi.fn(), clearScope: vi.fn(async () => {}) }
  const active = { inspect: vi.fn(), prepare: vi.fn(), consume: vi.fn(), clear: vi.fn() }
  const authHandler = vi.fn(async () => ({ ok: true, value: {} }))
  const handler = createRpc({ getAccountAuth, accountVault, usageReader, resetCreditService: active, authHandler, network: { fetch: (_purpose: string, ...args: unknown[]) => fetch(...args as [string, RequestInit]) } })
  return { handler, fetch, active, getAccountAuth, accountVault, usageReader, authHandler }
}
describe('account-bound Codex quota reset', () => {
  it('inspects every expiry, sorts earliest first, omits unusable credits and leaks no provider IDs or tokens', async () => {
    const f = fixture()
    const inspected = await f.handler('reset-credit/inspect', { id: 'b' }, signal())
    expect(inspected).toMatchObject({ ok: true, value: { availableCount: 3, credits: [{ name: 'Soon', expiresAt: start + 3600000 }, { name: 'Later', expiresAt: start + 7200000 }, {}] } })
    expect(inspected.value.credits[2].expiresAt).toBeUndefined()
    expect(JSON.stringify(inspected)).not.toMatch(/test-access|provider-b|creditId|redeemRequestId|expired|used/)
    expect(f.active.inspect).not.toHaveBeenCalled()
    expect(f.authHandler).not.toHaveBeenCalled()
    expect(f.fetch.mock.calls.every(call => call[1].method === 'GET')).toBe(true)
  })
  it('consumes only the selected non-active account credit after acknowledgement and delay', async () => {
    const f = fixture()
    const inspected = await f.handler('reset-credit/inspect', { id: 'b' }, signal())
    const prepared = await f.handler('reset-credit/prepare', { id: 'b', creditRef: inspected.value.credits[1].ref }, signal())
    expect(prepared).toMatchObject({ ok: true, value: { creditExpiresAt: start + 7200000, readyAt: start + 5000 } })
    const challengeId = prepared.value.challengeId
    expect((await f.handler('reset-credit/consume', { id: 'b', challengeId, acknowledged: true }, signal())).ok).toBe(false)
    vi.setSystemTime(start + 5001)
    expect((await f.handler('reset-credit/consume', { id: 'b', challengeId, acknowledged: false }, signal())).ok).toBe(false)
    const result = await f.handler('reset-credit/consume', { id: 'b', challengeId, acknowledged: true }, signal())
    expect(result).toMatchObject({ ok: true, value: { code: 'reset' } })
    const post = f.fetch.mock.calls.find(call => call[1].method === 'POST')!
    expect(JSON.parse(post[1].body as string).credit_id).toBe('provider-b-later')
    expect(f.usageReader.clearScope).toHaveBeenCalledExactlyOnceWith('b')
    expect(f.usageReader.clear).not.toHaveBeenCalled()
    expect(f.authHandler).not.toHaveBeenCalled()
    expect(f.active.consume).not.toHaveBeenCalled()
    expect(f.getAccountAuth.mock.calls.every(call => call[0] === 'b')).toBe(true)
    expect((await f.handler('reset-credit/consume', { id: 'b', challengeId, acknowledged: true }, signal())).ok).toBe(false)
    expect(f.fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
  })
  it('cannot replay one account’s credit reference or confirmation on another account', async () => {
    const f = fixture()
    const inspected = await f.handler('reset-credit/inspect', { id: 'b' }, signal())
    const creditRef = inspected.value.credits[0].ref
    expect((await f.handler('reset-credit/prepare', { id: 'a', creditRef }, signal())).ok).toBe(false)
    const prepared = await f.handler('reset-credit/prepare', { id: 'b', creditRef }, signal())
    vi.setSystemTime(start + 5001)
    expect((await f.handler('reset-credit/consume', { id: 'a', challengeId: prepared.value.challengeId, acknowledged: true }, signal())).ok).toBe(false)
    expect(f.fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(0)
  })
  it.each([null, '', 1, 'x'.repeat(513), 'missing'])('invalid explicit target %s never falls back to active-account resets', async id => {
    const f = fixture()
    for (const endpoint of ['inspect', 'prepare', 'consume']) expect((await f.handler(`reset-credit/${endpoint}`, { id }, signal())).ok).toBe(false)
    expect(f.active.inspect).not.toHaveBeenCalled(); expect(f.active.prepare).not.toHaveBeenCalled(); expect(f.active.consume).not.toHaveBeenCalled()
    expect(f.fetch).not.toHaveBeenCalled()
  })
  it('retries uncertain redemption using the same idempotency request, never a new credit', async () => {
    const f = fixture()
    const inspected = await f.handler('reset-credit/inspect', { id: 'b' }, signal())
    const prepared = await f.handler('reset-credit/prepare', { id: 'b', creditRef: inspected.value.credits[0].ref }, signal())
    const original = f.fetch.getMockImplementation()!
    let first = true
    f.fetch.mockImplementation(async (...args) => {
      if (args[1].method === 'POST' && first) { first = false; throw Error('connection lost') }
      return original(...args)
    })
    vi.setSystemTime(start + 5001)
    const payload = { id: 'b', challengeId: prepared.value.challengeId, acknowledged: true }
    expect(await f.handler('reset-credit/consume', payload, signal())).toMatchObject({ ok: false, error: { message: expect.stringContaining('uncertain') } })
    expect(await f.handler('reset-credit/consume', payload, signal())).toMatchObject({ ok: true, value: { code: 'reset' } })
    const bodies = f.fetch.mock.calls.filter(call => call[1].method === 'POST').map(call => JSON.parse(call[1].body as string))
    expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1])
  })
  it('rejects expired confirmations before any POST and tolerates forecast-clear errors after a completed reset', async () => {
    const f = fixture()
    const inspected = await f.handler('reset-credit/inspect', { id: 'b' }, signal())
    const payload = { id: 'b', creditRef: inspected.value.credits[0].ref }
    const first = await f.handler('reset-credit/prepare', payload, signal())
    vi.setSystemTime(first.value.expiresAt + 1)
    expect((await f.handler('reset-credit/consume', { id: 'b', challengeId: first.value.challengeId, acknowledged: true }, signal())).ok).toBe(false)
    const second = await f.handler('reset-credit/prepare', payload, signal())
    vi.setSystemTime(second.value.readyAt + 1)
    f.usageReader.clearScope.mockRejectedValueOnce(Error('storage failed'))
    expect(await f.handler('reset-credit/consume', { id: 'b', challengeId: second.value.challengeId, acknowledged: true }, signal())).toMatchObject({ ok: true, value: { code: 'reset' } })
    expect(f.fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
  })
  it('returns an empty inspection when no credits remain, without allowing preparation', async () => {
    const service = createService({ getAuth: async () => ({ auth: { apiKey: 'test' } }), readCredential: async () => ({ type: 'oauth', accountId: 'test' }), usageReader: {}, fetch: async () => new Response('{"available_count":0,"credits":[]}') })
    expect(await service.inspect()).toEqual({ availableCount: 0, credits: [] })
    await expect(service.prepare()).rejects.toThrow('No usable quota reset')
  })
})
