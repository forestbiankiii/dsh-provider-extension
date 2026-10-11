import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createOutputVerbosityOwner, outputVerbositySchema, type OutputVerbosity } from '../src/codex/output-verbosity.ts'

const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = (name: string) => source.split(`//#region src/${name}.js\n`)[1]!.split('//#endregion')[0]!
const { createRpc, createTool } = new Function(`${['image-features', 'capability-settings', 'settings-contract', 'preference-fields', 'subscription-rpc', 'output-verbosity-tool'].map(region).join('\n')}\nreturn { createRpc: createSubscriptionRpcHandler, createTool: createOutputVerbosityTool }`)()
const createProvider = new Function('createOpenAICodexProvider', 'normalizeAbortDrops', 'OUTPUT_VERBOSITY_DEFAULT', `${region('pi-ai-runtime')}\nreturn openaiCodexSubscriptionProvider`)
const signal = () => new AbortController().signal
function fixture(live = false) {
  const entry = { options: { config: { claudeExecutable: 'keep-original', codexOutputVerbosity: 'default' } as Record<string, unknown> } }
  const edit = vi.fn(async (_entry: unknown, change: (raw: Record<string, unknown>) => Record<string, unknown>) => { entry.options.config = change(entry.options.config) })
  const ctx = { fiber: { entry }, get: (name: string) => name === 'configEditor' ? { edit } : undefined }
  const owner = createOutputVerbosityOwner(ctx as never, live ? { get: () => entry.options.config.codexOutputVerbosity as OutputVerbosity } : 'default')
  const preferences = { status: () => ({ outputVerbosity: owner.current(), outputVerbosityWritable: owner.writable, searchProvider: 'dsh', searchMode: 'disabled', speedMode: 'standard' }), update: vi.fn(async (patch: { outputVerbosity: OutputVerbosity }, s: AbortSignal) => owner.save(patch.outputVerbosity, s)) }
  const handler = createRpc({ preferences })
  return { owner, ctx, entry, edit, handler, preferences, tool: createTool(handler) }
}

describe('Codex response detail persistence and RPC', () => {
  it.each([false, true])('persists via the native editor with linked primitive/live-ref config=%s', async live => {
    const f = fixture(live)
    expect((outputVerbositySchema.meta as { volatile?: boolean }).volatile).toBe(true)
    expect((await f.handler('preferences/status', {}, signal())).value.outputVerbosity).toBe('default')
    expect(f.edit).not.toHaveBeenCalled()
    for (const value of ['low', 'medium', 'high', 'default'] as const) {
      expect(await f.handler('preferences/update', { outputVerbosity: value }, signal())).toMatchObject({ ok: true, value: { outputVerbosity: value } })
      expect(f.entry.options.config).toEqual({ claudeExecutable: 'keep-original', codexOutputVerbosity: value })
      expect(createOutputVerbosityOwner(f.ctx as never, 'default').current()).toBe(value)
    }
    expect(f.edit).toHaveBeenCalledTimes(4)
  })
  it('sets through the same RPC operation from a deferred, narrowly scoped Agent tool', async () => {
    const f = fixture()
    expect(f.tool.deferLoading).toBe(true)
    expect(f.tool.isConcurrencySafe({ action: 'get' })).toBe(true)
    expect(await f.tool.execute({ action: 'set', outputVerbosity: 'high' }, { signal: signal() })).toEqual({ outputVerbosity: 'high', writable: true })
    expect(f.preferences.update).toHaveBeenCalledOnce()
    expect((await f.handler('preferences/status', {}, signal())).value).toMatchObject({ outputVerbosity: 'high', searchProvider: 'dsh', searchMode: 'disabled', speedMode: 'standard' })
    expect(await f.tool.execute({ action: 'get' }, { signal: signal() })).toEqual({ outputVerbosity: 'high', writable: true })
    for (const input of [{ action: 'set', outputVerbosity: 'huge' }, { action: 'set', outputVerbosity: 'low', searchProvider: 'codex' }, { action: 'get', outputVerbosity: 'high' }]) await expect(f.tool.execute(input, { signal: signal() })).rejects.toThrow()
    expect(f.edit).toHaveBeenCalledOnce()
  })
  it('rejects invalid values, cancellation and read-only settings without a write', async () => {
    const f = fixture()
    expect((await f.handler('preferences/update', { outputVerbosity: 'huge' }, signal())).ok).toBe(false)
    const abort = new AbortController(); abort.abort()
    await expect(f.handler('preferences/update', { outputVerbosity: 'low' }, abort.signal)).rejects.toThrow()
    const readonly = createOutputVerbosityOwner({ fiber: {}, get: () => undefined } as never)
    expect(readonly.writable).toBe(false)
    await expect(readonly.save('low')).rejects.toThrow('cannot persist')
    const readHandler = createRpc({ preferences: { status: () => ({ outputVerbosity: 'default', outputVerbosityWritable: false }), update: f.preferences.update } })
    expect((await readHandler('preferences/update', { outputVerbosity: 'high' }, signal())).ok).toBe(false)
    expect(f.edit).not.toHaveBeenCalled()
  })
  it('reports failed and no-op persistence instead of changing the acknowledged preference', async () => {
    const f = fixture(); f.edit.mockRejectedValueOnce(Error('disk failure'))
    expect((await f.handler('preferences/update', { outputVerbosity: 'high' }, signal())).ok).toBe(false)
    expect(f.owner.current()).toBe('default')
    f.edit.mockImplementationOnce(async () => {})
    await expect(f.owner.save('high')).rejects.toThrow('did not accept')
    await expect(f.tool.execute({ action: 'set', outputVerbosity: 'high' }, { signal: signal() })).resolves.toMatchObject({ outputVerbosity: 'high' })
  })
  it('prevents duplicate writes and leaves the old value until native persistence finishes', async () => {
    const f = fixture(); let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const original = f.edit.getMockImplementation()!
    f.edit.mockImplementationOnce(async (...args) => { await pending; await original(...args) })
    const save = f.owner.save('high')
    expect(f.owner.current()).toBe('default')
    await expect(f.owner.save('low')).rejects.toThrow('already in progress')
    finish(); await save; expect(f.owner.current()).toBe('high')
  })
})

describe('actual Codex stream request preference wrapper', () => {
  it.each(['low', 'medium', 'high', 'default'])('passes %s to both stream routes, preserving tool and text formatting payloads', async value => {
    const outputVerbosity = value as OutputVerbosity
    const stream = vi.fn(async function* (model: unknown, _context: unknown, options: { textVerbosity: string; onPayload: (payload: unknown, model: unknown) => Promise<unknown> }) {
      yield { option: options.textVerbosity, payload: await options.onPayload({ text: { format: { type: 'json_object' } }, tools: [{ type: 'function', name: 'keep-tool' }] }, model) }
    })
    const provider = createProvider(() => ({ auth: {}, stream, streamSimple: stream }), (x: unknown) => x, 'default')({ resolveOutputVerbosity: () => outputVerbosity, catalog: { metadata: () => ({ supportVerbosity: true, defaultVerbosity: 'low' }) } })
    for (const route of ['stream', 'streamSimple']) {
      const result = await provider[route]({ id: 'catalog-model' }, {}, { onPayload: async (payload: object) => ({ ...payload, marker: 'keep', text: { format: { type: 'json_object' }, verbosity: 'untrusted-override' } }) }).next()
      expect(result.value).toEqual({ option: value === 'default' ? 'low' : value, payload: { marker: 'keep', text: { format: { type: 'json_object' }, verbosity: value === 'default' ? 'low' : value }, tools: [{ type: 'function', name: 'keep-tool' }] } })
    }
  })
  it('does not inject a verbosity preference for models whose catalog explicitly marks it unsupported', async () => {
    const stream = vi.fn(async function* (model: unknown, _context: unknown, options: { textVerbosity?: string; onPayload: (payload: unknown, model: unknown) => Promise<unknown> }) { yield { option: options.textVerbosity, payload: await options.onPayload({ text: { format: { type: 'json_object' } } }, model) } })
    const provider = createProvider(() => ({ auth: {}, stream }), (x: unknown) => x, 'default')({ resolveOutputVerbosity: () => 'high', catalog: { metadata: () => ({ supportVerbosity: false }) } })
    expect((await provider.stream({ id: 'catalog-model' }, {}).next()).value).toEqual({ option: undefined, payload: { text: { format: { type: 'json_object' } } } })
  })
})
