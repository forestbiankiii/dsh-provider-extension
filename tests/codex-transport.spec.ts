import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import { describe, expect, it, vi } from 'vitest'
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = (name: string) => source.split(`//#region src/${name}.js\n`)[1]!.split('//#endregion')[0]!
const register = new Function('clientRequestSchema', `${region('rpc-contract')}\n${region('subscription-transport')}\nreturn registerSubscriptionTransport`)(clientRequestSchema)
function fixture() {
  const routes = new Map<string, { methods: string[]; fetch(request: Request): Promise<Response> }>()
  const handler = vi.fn(async (endpoint: string, payload: unknown) => ({ ok: true, value: { endpoint, payload } }))
  const dispose = register({ fetch: { register: (route: { path: string; methods: string[]; fetch(request: Request): Promise<Response> }) => { routes.set(route.path, route); return () => routes.delete(route.path) } } }, handler)
  return { routes, handler, dispose }
}
describe('Codex registered HTTP transport', () => {
  it('registers the account model catalog route and dispatches the actual POST envelope', async () => {
    const f = fixture()
    const route = f.routes.get('/api/codex-subscription/models')
    expect(route).toBeDefined()
    expect(route!.methods).toEqual(['POST'])
    const rpcId = randomUUID()
    const request = new Request('http://localhost/api/codex-subscription/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId, method: 'codex-subscription/models', payload: { id: 'non-active' } }) })
    const response = await route!.fetch(request)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ type: 'server-response', rpcId, result: { ok: true, value: { endpoint: 'models', payload: { id: 'non-active' } } } })
    expect(f.handler).toHaveBeenCalledExactlyOnceWith('models', { id: 'non-active' }, request.signal)
    f.dispose(); expect(f.routes.size).toBe(0)
  })
  it('registers read, preparation and consumption reset routes, not just their business handlers', () => {
    const f = fixture()
    for (const endpoint of ['usage', 'models', 'reset-credit/inspect', 'reset-credit/prepare', 'reset-credit/consume']) expect(f.routes.has(`/api/codex-subscription/${endpoint}`)).toBe(true)
    f.dispose()
  })
  it('rejects wrong envelopes before dispatching any registered handler', async () => {
    const f = fixture()
    const route = f.routes.get('/api/codex-subscription/usage')!
    for (const method of ['codex-subscription/models', 'codex-subscription/reset-credit/consume']) {
      const request = new Request('http://localhost/api/codex-subscription/usage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { id: 'non-active' } }) })
      expect((await route.fetch(request)).status).toBe(400)
    }
    expect(f.handler).not.toHaveBeenCalled()
    f.dispose()
  })
})
