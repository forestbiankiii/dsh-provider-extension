import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createSpeedModeOwner, speedModeSchema, type SpeedMode } from '../src/codex/speed-mode.ts'
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = (name: string) => source.split(`//#region src/${name}.js\n`)[1]!.split('//#endregion')[0]!
const start = source.indexOf('\tconst preferences = {', source.indexOf('function apply(ctx,'))
const preferencesSource = source.slice(start, source.indexOf('\n\tconst authModels =', start))
const createBackend = new Function('ctx', 'settings', 'speedModeOwner', 'createOpenAICodexProvider', 'normalizeAbortDrops', 'modelCatalog', `${['image-models', 'image-features', 'capability-settings', 'settings-contract', 'preference-fields', 'subscription-rpc', 'speed-mode-tool', 'pi-ai-runtime'].map(region).join('\n')}
const contextLengthOwner = undefined, outputVerbosityOwner = undefined, compactionOwner = undefined;
const imageFeaturesOwner = { current: () => ({ imageGeneration: true, imageEditing: true }), writable: false, save: () => { throw Error('Unexpected image settings update') } };
const contextPreferences = { status: () => ({contextMode:'standard',customContextModels:{},contextModels:[]}), update: () => { throw Error('Unexpected context update') } };
const provider = openaiCodexSubscriptionProvider({ resolveSpeedMode: () => speedModeOwner.current(), catalog: modelCatalog });
${preferencesSource}
const handler = createSubscriptionRpcHandler({ preferences });
return { provider, preferences, handler, tool: createSpeedModeTool(handler) };`)
const signal = () => new AbortController().signal
function fixture(live = false, support: boolean | null = true, id = 'gpt-6.1-sol') {
  const entry = { options: { config: { codexOutputVerbosity: 'high', codexContextLength: { mode: 'custom', models: { preserved: 200000 } }, claudeExecutable: 'preserve' } as Record<string, unknown> } }
  const edit = vi.fn(async (_entry: unknown, change: (raw: Record<string, unknown>) => Record<string, unknown>) => { entry.options.config = change(entry.options.config) })
  const ctx = { fiber: { entry }, get: () => ({ edit }), settings: { writable: false } }
  const owner = createSpeedModeOwner(ctx as never, live ? { get: () => entry.options.config.codexSpeedMode as SpeedMode ?? 'standard' } : 'standard')
  const settings = { get: () => ({ speedMode: 'standard', outputVerbosity: 'high', searchMode: 'disabled', searchProvider: 'dsh' }), update: vi.fn() }
  const stream = vi.fn(async function* (model: unknown, _context: unknown, options: { serviceTier?: string; reasoningEffort?: string; onPayload: (payload: unknown, model: unknown) => Promise<unknown> }) {
    for (let n = 0; n < 2; n++) yield { serviceTier: options.serviceTier, reasoningEffort: options.reasoningEffort, payload: await options.onPayload({ reasoning: { effort: 'high' }, tools: [{ type: 'function', name: 'preserve' }], text: { format: { type: 'json_object' } } }, model) }
  })
  const models = [{ id, name: id, contextWindow: 272000, maxContextWindow: 872000 }]
  const modelCatalog = { getModels: () => models, metadata: () => support === null ? undefined : { supportsFast: support }, status: () => ({ source: 'test' }) }
  const backend = createBackend(ctx, settings, owner, () => ({ auth: {}, getModels: () => models, stream, streamSimple: stream }), (value: unknown) => value, modelCatalog)
  return { ...backend, ctx, owner, edit, entry, settings, stream, update: (value: unknown, s = signal()) => backend.handler('preferences/update', { speedMode: value }, s) }
}

describe('native Codex speed preference and real mounted preference operations', () => {
  it.each([false, true])('persists and re-reads primitive/live-ref configuration=%s without touching other config', async live => {
    const f = fixture(live)
    expect((speedModeSchema.meta as { volatile?: boolean }).volatile).toBe(true)
    expect(f.preferences.status()).toMatchObject({ speedMode: 'standard', speedModeWritable: true, searchMode: 'disabled', outputVerbosity: 'high' })
    expect(f.edit).not.toHaveBeenCalled()
    for (const value of ['fast', 'standard'] as const) {
      expect(await f.update(value)).toMatchObject({ ok: true, value: { speedMode: value } })
      expect(createSpeedModeOwner(f.ctx as never).current()).toBe(value)
      expect(f.entry.options.config).toMatchObject({ codexOutputVerbosity: 'high', codexContextLength: { mode: 'custom', models: { preserved: 200000 } }, claudeExecutable: 'preserve' })
    }
    expect(f.settings.update).not.toHaveBeenCalled()
  })
  it('uses the same handler from a bounded deferred Agent tool and rejects unrelated parameters', async () => {
    const f = fixture()
    expect(await f.tool.execute({ action: 'set', speedMode: 'fast' }, { signal: signal() })).toEqual({ speedMode: 'fast', writable: true, fastModels: ['gpt-6.1-sol'], truncated: false })
    expect(await f.tool.execute({ action: 'get' }, { signal: signal() })).toMatchObject({ speedMode: 'fast' })
    for (const args of [{ action: 'set', speedMode: 'ultrafast' }, { action: 'get', speedMode: 'fast' }, { action: 'set', speedMode: 'fast', searchMode: 'live' }]) await expect(f.tool.execute(args, { signal: signal() })).rejects.toThrow()
    expect(f.edit).toHaveBeenCalledOnce()
    expect(f.tool.isConcurrencySafe({ action: 'set' })).toBe(false)
    expect(f.tool.deferLoading).toBe(true)
    expect(JSON.stringify([f.tool].filter((tool: { deferLoading: boolean }) => !tool.deferLoading).map((tool: { parameters: unknown }) => tool.parameters))).toBe(JSON.stringify([]))
  })
  it('rejects unsupported values, cancellation and read-only saves before persistence', async () => {
    const f = fixture()
    expect((await f.update('ultrafast')).ok).toBe(false)
    const abort = new AbortController(); abort.abort()
    await expect(f.update('fast', abort.signal)).rejects.toThrow()
    const readonly = createSpeedModeOwner({ get: () => undefined } as never)
    await expect(readonly.save('fast')).rejects.toThrow('cannot persist')
    const handler = new Function(`${['image-models', 'image-features', 'capability-settings', 'settings-contract', 'preference-fields', 'subscription-rpc'].map(region).join('\n')}\nreturn createSubscriptionRpcHandler`)()({ preferences: { status: () => ({ speedModeWritable: false, writable: true }), update: f.settings.update } })
    expect(await handler('preferences/update', { speedMode: 'fast' }, signal())).toMatchObject({ ok: false, error: { message: 'Codex speed mode settings are read-only' } })
    expect(f.edit).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled()
  })
  it('reports failed and no-op writes and blocks duplicate saves until acknowledgement', async () => {
    const f = fixture()
    f.edit.mockRejectedValueOnce(Error('disk failure'))
    expect((await f.update('fast')).ok).toBe(false)
    expect(f.owner.current()).toBe('standard')
    f.edit.mockImplementationOnce(async () => {})
    await expect(f.owner.save('fast')).rejects.toThrow('did not accept')
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const original = f.edit.getMockImplementation()!
    f.edit.mockImplementationOnce(async (...args) => { await pending; await original(...args) })
    const save = f.owner.save('fast')
    expect(f.owner.current()).toBe('standard')
    await expect(f.owner.save('standard')).rejects.toThrow('already in progress')
    finish(); await save; expect(f.owner.current()).toBe('fast')
  })
})

describe('actual stream and streamSimple priority payloads', () => {
  it.each(['stream', 'streamSimple'])('injects priority only when supported in %s and preserves reasoning, tools and formatting', async route => {
    const f = fixture(); await f.update('fast')
    const result = (await f.provider[route]({ id: 'gpt-6.1-sol' }, {}, { reasoningEffort: 'high', onPayload: async (payload: object) => ({ ...payload, service_tier: 'override', marker: 'preserve' }) }).next()).value
    expect(result).toMatchObject({ serviceTier: 'priority', reasoningEffort: 'high', payload: { service_tier: 'priority', marker: 'preserve', reasoning: { effort: 'high' }, tools: [{ type: 'function', name: 'preserve' }], text: { format: { type: 'json_object' } } } })
    await f.update('standard')
    const normal = (await f.provider[route]({ id: 'gpt-6.1-sol' }, {}, { reasoningEffort: 'high' }).next()).value
    expect(normal.serviceTier).toBeUndefined(); expect(normal.payload).not.toHaveProperty('service_tier')
  })
  it.each([[false, 'gpt-5.6-luna'], [null, 'unknown-model'], [null, 'gpt-5.4-mini']])('does not force priority for support=%s id=%s', async (support, id) => {
    const f = fixture(false, support as boolean | null, id as string); await f.update('fast')
    for (const route of ['stream', 'streamSimple']) {
      const result = (await f.provider[route]({ id }, {}, {}).next()).value
      expect(result.serviceTier).toBeUndefined(); expect(result.payload).not.toHaveProperty('service_tier')
    }
  })
  it('retains the existing documented fallback for known Fast-capable models when metadata is absent', async () => {
    const f = fixture(false, undefined, 'gpt-5.6-luna'); await f.update('fast')
    expect((await f.provider.stream({ id: 'gpt-5.6-luna' }, {}, {}).next()).value.serviceTier).toBe('priority')
  })
  it('does not mutate an in-progress stream when the preference changes', async () => {
    const f = fixture(); await f.update('fast')
    const iterator = f.provider.stream({ id: 'gpt-6.1-sol' }, {}, {})
    expect((await iterator.next()).value.serviceTier).toBe('priority')
    await f.update('standard')
    expect((await iterator.next()).value.serviceTier).toBe('priority')
    expect((await f.provider.stream({ id: 'gpt-6.1-sol' }, {}, {}).next()).value.serviceTier).toBeUndefined()
  })
})
