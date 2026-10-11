import { describe, expect, it, vi } from 'vitest'
import { applyDefaultModel, createDefaultModelOperation, createDefaultModelTool, type DefaultModelSelection } from '../src/default-model.ts'
import { defaultModelRequest } from '../src/client/default-model.ts'

function fixture() {
  let selected: DefaultModelSelection = { provider: 'deepseek-account', model: 'previous', reasoningEffort: 'high' }
  let active = 'work'
  const owner = { currentSelection: vi.fn(() => ({ ...selected })), saveSelection: vi.fn(async (next: DefaultModelSelection) => { selected = { ...next } }) }
  const call = vi.fn(async (endpoint: string) => ({ ok: true, value: endpoint === 'status'
    ? { accounts: [{ id: 'work', active: active === 'work' }, { id: 'personal', active: active === 'personal' }] }
    : [{ id: 'official-model', name: 'Official Model' }] }))
  const get = vi.fn((key: string) => key === 'agentDefaultModel' ? owner : key === 'configEditor' ? {} : undefined)
  const operation = createDefaultModelOperation({ get } as never, () => ({ call } as never))
  const signal = new AbortController().signal
  return { operation, owner, call, get, signal, setActive: (id: string) => { active = id }, selected: () => selected }
}
const request = { action: 'set', accountId: 'work', model: 'official-model' }

describe('native Codex default model', () => {
  it('reads the native default and active account without changing either', async () => {
    const f = fixture()
    await expect(f.operation({ action: 'get' }, f.signal)).resolves.toEqual({ selection: f.selected(), activeAccountId: 'work' })
    expect(f.owner.saveSelection).not.toHaveBeenCalled()
    expect(f.call).toHaveBeenCalledExactlyOnceWith('status', {}, f.signal)
  })
  it('reads the latest native default after a slow account-status read', async () => {
    const f = fixture(); let finish!: (value: unknown) => void
    f.call.mockImplementationOnce(() => new Promise(resolve => { finish = resolve as never }))
    const read = f.operation({ action: 'get' }, f.signal)
    await f.owner.saveSelection({ provider: 'openai-codex', model: 'official-model' })
    finish({ ok: true, value: { accounts: [{ id: 'work', active: true }] } })
    expect((await read).selection.model).toBe('official-model')
  })
  it('validates the exact active account catalog and awaits the native save, without switching accounts or Sessions', async () => {
    const f = fixture()
    await expect(f.operation(request, f.signal)).resolves.toEqual({ selection: { provider: 'openai-codex', model: 'official-model' }, activeAccountId: 'work' })
    expect(f.owner.saveSelection).toHaveBeenCalledExactlyOnceWith({ provider: 'openai-codex', model: 'official-model' })
    expect(f.call.mock.calls.map(args => args[0])).toEqual(['status', 'models', 'status'])
    expect(f.call.mock.calls[1]).toEqual(['models', { id: 'work' }, f.signal])
    expect(f.selected().reasoningEffort).toBeUndefined()
  })
  it('preserves reasoning when explicitly keeping the same Codex model', async () => {
    const f = fixture()
    await f.owner.saveSelection({ provider: 'openai-codex', model: 'official-model', reasoningEffort: 'high' })
    f.owner.saveSelection.mockClear()
    expect((await f.operation(request, f.signal)).selection.reasoningEffort).toBe('high')
  })
  it.each([
    { action: 'set', model: 'official-model' }, { ...request, model: '' }, { ...request, accountId: '' },
    { ...request, provider: 'external-openai-codex' }, { ...request, sessionId: 'existing-session' },
  ])('rejects malformed or authority-expanding payloads before any read or write: %j', async raw => {
    const f = fixture()
    await expect(f.operation(raw, f.signal)).rejects.toThrow()
    expect(f.call).not.toHaveBeenCalled(); expect(f.owner.saveSelection).not.toHaveBeenCalled()
  })
  it('rejects inactive accounts and unadvertised models, without changing the default', async () => {
    const f = fixture()
    await expect(f.operation({ ...request, accountId: 'personal' }, f.signal)).rejects.toThrow('Select this Codex account')
    await expect(f.operation({ ...request, model: 'invented-model' }, f.signal)).rejects.toThrow('not available')
    expect(f.owner.saveSelection).not.toHaveBeenCalled()
  })
  it('rejects catalog results that outlive an active-account switch', async () => {
    const f = fixture()
    const original = f.call.getMockImplementation()!
    f.call.mockImplementation(async endpoint => { const response = await original(endpoint); if (endpoint === 'models') f.setActive('personal'); return response })
    await expect(f.operation(request, f.signal)).rejects.toThrow('account changed')
    expect(f.owner.saveSelection).not.toHaveBeenCalled()
  })
  it('does not write after cancellation', async () => {
    const f = fixture(); const abort = new AbortController(); abort.abort()
    await expect(f.operation(request, abort.signal)).rejects.toThrow()
    expect(f.owner.saveSelection).not.toHaveBeenCalled(); expect(f.call).not.toHaveBeenCalled()
  })
  it('waits for persistence and refuses duplicate writes while one save is pending', async () => {
    const f = fixture(); let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const originalSave = f.owner.saveSelection.getMockImplementation()!
    f.owner.saveSelection.mockImplementationOnce(async next => { await pending; await originalSave(next) })
    const save = f.operation(request, f.signal)
    await vi.waitFor(() => expect(f.owner.saveSelection).toHaveBeenCalledOnce())
    expect(f.selected().model).toBe('previous')
    await expect(f.operation(request, f.signal)).rejects.toThrow('already in progress')
    finish(); await save
    expect(f.selected().model).toBe('official-model')
  })
  it('reports native persistence failure and allows an explicit retry', async () => {
    const f = fixture(); f.owner.saveSelection.mockRejectedValueOnce(Error('disk write failed'))
    await expect(f.operation(request, f.signal)).rejects.toThrow('disk write failed')
    expect(f.selected().model).toBe('previous')
    await expect(f.operation(request, f.signal)).resolves.toMatchObject({ selection: { model: 'official-model' } })
  })
  it('does not report an unsupported or silent no-op native save as success', async () => {
    const f = fixture()
    f.get.mockImplementation(key => key === 'agentDefaultModel' ? f.owner : undefined)
    await expect(f.operation(request, f.signal)).rejects.toThrow('cannot persist')
    f.get.mockImplementation(key => key === 'agentDefaultModel' ? f.owner : {})
    f.owner.saveSelection.mockImplementation(async () => {})
    await expect(f.operation(request, f.signal)).rejects.toThrow('did not accept')
  })
  it('shares identical operation results between the page and deferred Agent tool', async () => {
    const f = fixture(); const tool = createDefaultModelTool(f.operation)
    expect(tool.deferLoading).toBe(true)
    expect(tool.isConcurrencySafe?.({ action: 'get' })).toBe(true)
    expect(tool.isConcurrencySafe?.(request)).toBe(false)
    const result = await tool.execute(request, { signal: f.signal } as never)
    expect(result).toEqual(await f.operation({ action: 'get' }, f.signal))
    expect(f.owner.saveSelection).toHaveBeenCalledOnce()
  })
  it('registers and dispatches the authenticated exact page route with an envelope', async () => {
    const f = fixture(); const routes: { path: string; fetch: (request: Request) => Promise<Response> }[] = []
    const register = vi.fn((route: typeof routes[number]) => { routes.push(route); return async () => {} })
    const context = { get: f.get, tools: { register: vi.fn(() => () => {}) }, connection: { fetch: { register } },
      effect: (callback: () => unknown) => callback(), inject: (_keys: string[], callback: (ctx: unknown) => unknown) => callback(context) }
    applyDefaultModel(context as never, () => ({ call: f.call } as never))
    expect(routes.map(route => route.path)).toEqual(['/api/provider-extension/default-model'])
    const response = await routes[0]!.fetch(new Request('http://localhost/api/provider-extension/default-model', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'request-1', method: 'provider-extension/default-model', payload: request }),
    }))
    expect(await response.json()).toMatchObject({ type: 'server-response', rpcId: 'request-1', result: { ok: true, value: { selection: { provider: 'openai-codex', model: 'official-model' } } } })
    expect(f.owner.saveSelection).toHaveBeenCalledOnce()
  })
  it('client sends only default-model operations, and propagates failure instead of inventing a selection', async () => {
    const call = vi.fn(async () => ({ ok: true, value: { selection: { provider: 'openai-codex', model: 'official-model' }, activeAccountId: 'work' } }))
    await defaultModelRequest({ call } as never, request as { action: 'set'; accountId: string; model: string })
    expect(call).toHaveBeenCalledExactlyOnceWith('/api', 'provider-extension/default-model', request)
    call.mockResolvedValueOnce({ ok: false, error: { message: 'write rejected' } } as never)
    await expect(defaultModelRequest({ call } as never, { action: 'get' })).rejects.toThrow('write rejected')
    call.mockResolvedValueOnce({ ok: true, value: { selection: { provider: 'openai-codex', model: '' }, activeAccountId: 'work' } })
    await expect(defaultModelRequest({ call } as never, { action: 'get' })).rejects.toThrow('Invalid default-model response')
  })
})
