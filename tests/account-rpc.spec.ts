import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountRpcFallback } from '../src/client/account-rpc.ts'

afterEach(() => vi.unstubAllGlobals())

describe('account RPC fallback', () => {
  it('uses the existing /api envelope and returns the validated result', async () => {
    vi.stubGlobal('location', { origin: 'http://127.0.0.1:3000' })
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      const request = JSON.parse(init.body as string)
      expect(request).toMatchObject({
        type: 'client-request', method: 'antigravity-auth/status', payload: {},
      })
      expect(request.rpcId).toEqual(expect.any(String))
      return Response.json({
        type: 'server-response', rpcId: request.rpcId, result: { ok: true, value: { ready: true } },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(accountRpcFallback.call('/api', 'antigravity-auth/status', {}))
      .resolves.toEqual({ ok: true, value: { ready: true } })
    expect(fetchMock.mock.calls[0][0].href).toBe('http://127.0.0.1:3000/api/antigravity-auth/status')
  })

  it('rejects targets outside plugin account routes', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(accountRpcFallback.call('/other', 'status', {})).rejects.toThrow('Invalid account RPC target')
    await expect(accountRpcFallback.call('/api', '../status', {})).rejects.toThrow('Invalid account RPC target')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a response with the wrong request id', async () => {
    vi.stubGlobal('location', { origin: 'http://127.0.0.1:3000' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      type: 'server-response', rpcId: 'different', result: { ok: true, value: {} },
    })))
    await expect(accountRpcFallback.call('/api', 'antigravity-auth/status', {}))
      .rejects.toThrow('Invalid account RPC response')
  })
})
