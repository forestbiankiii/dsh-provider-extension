import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createContextLengthOwner, contextLengthSchema, type ContextLength } from '../src/codex/context-length.ts'
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = (name: string) => source.split(`//#region src/${name}.js\n`)[1]!.split('//#endregion')[0]!
const functions = new Function('createOpenAICodexProvider', 'normalizeAbortDrops', `${['image-features', 'capability-settings', 'settings-contract', 'preference-fields', 'context-length', 'subscription-rpc', 'pi-ai-runtime', 'version', 'model-catalog'].map(region).join('\n')}\nreturn { createRpc: createSubscriptionRpcHandler, createPreferences: createContextPreferences, createTool: createContextLengthTool, createProvider: openaiCodexSubscriptionProvider, snapshotProfile: snapshotCodexProfile, mergeModel, parseOfficialModelCatalog }`)
const models = [
  { id: 'gpt-5.5', name: 'Large', contextWindow: 272000, maxContextWindow: 1000000 },
  { id: 'gpt-5.4-mini', name: 'Mini', contextWindow: 272000, maxContextWindow: 400000 },
  { id: 'new-model', name: 'New Model', contextWindow: 180000, maxContextWindow: 220000 },
  { id: 'gpt-5.3-codex-spark', name: 'Spark', contextWindow: 128000, maxContextWindow: 128000 },
  { id: 'gpt-5.6-one', name: 'Variant One', contextWindow: 272000, maxContextWindow: 1000000 },
  { id: 'gpt-5.6-two', name: 'Variant Two', contextWindow: 272000, maxContextWindow: 500000 },
]
function fixture(live = false) {
  const entry = { options: { config: { codexOutputVerbosity: 'high', claudeExecutable: 'preserve' } as Record<string, unknown> } }
  const edit = vi.fn(async (_entry: unknown, change: (value: Record<string, unknown>) => Record<string, unknown>) => { entry.options.config = change(entry.options.config) })
  const ctx = { fiber: { entry }, get: () => ({ edit }) }
  const owner = createContextLengthOwner(ctx as never, live ? { get: () => entry.options.config.codexContextLength as ContextLength ?? { mode: 'standard', models: {} } } : undefined)
  const backend = functions(() => ({ auth: {}, getModels: () => models }), (value: unknown) => value)
  const notify = vi.fn()
  const settings = { get: () => ({ searchMode: 'disabled', speedMode: 'standard' }), update: vi.fn() }
  const preferences = backend.createPreferences({ owner, settings, models: () => models, onChange: notify })
  const handler = backend.createRpc({ preferences: { status: () => ({ ...preferences.status(), searchMode: 'disabled', outputVerbosity: 'high' }), update: preferences.update } })
  const provider = backend.createProvider({ resolveContextMode: () => preferences.current().mode, resolveCustomContextWindow: preferences.resolveWindow })
  return { ctx, entry, edit, owner, preferences, notify, handler, provider, backend, settings, tool: backend.createTool(handler), update: (patch: unknown, signal = new AbortController().signal) => handler('preferences/update', patch, signal) }
}

describe('Codex context capacity, persistence and actual provider model budgets', () => {
  it.each([false, true])('preserves native config and handles primitive/live refs=%s without writing default on mount', async live => {
    const f = fixture(live)
    expect((contextLengthSchema.meta as { volatile?: boolean }).volatile).toBe(true)
    expect(f.provider.getModels().map((m: { contextWindow: number }) => m.contextWindow)).toEqual(models.map(m => m.contextWindow))
    expect(f.edit).not.toHaveBeenCalled()
    expect((await f.update({ contextMode: 'extended' })).ok).toBe(true)
    expect(f.provider.getModels().map((m: { contextWindow: number }) => m.contextWindow)).toEqual(models.map(m => m.maxContextWindow))
    expect(f.notify).toHaveBeenCalledOnce()
    f.preferences.notify(); expect(f.notify).toHaveBeenCalledOnce()
    expect((await f.update({ contextMode: 'custom', customContextModels: { 'gpt-5.5': 600000, 'gpt-5.4-mini': 200000 } })).ok).toBe(true)
    expect(f.provider.getModels()[0].contextWindow).toBe(600000)
    expect(f.provider.getModels()[1].contextWindow).toBe(200000)
    expect(f.provider.getModels()[2].contextWindow).toBe(180000)
    expect(f.provider.getModels()[3].contextWindow).toBe(128000)
    expect(createContextLengthOwner(f.ctx as never).current()).toEqual({ mode: 'custom', models: { 'gpt-5.4-mini': 200000, 'gpt-5.5': 600000 } })
    expect(f.entry.options.config).toMatchObject({ codexOutputVerbosity: 'high', claudeExecutable: 'preserve' })
    expect(f.settings.update).not.toHaveBeenCalled()
    await f.update({ contextMode: 'standard' })
    expect(f.provider.getModels()).toEqual(models)
    expect(f.owner.current().models['gpt-5.5']).toBe(600000)
  })
  it.each([{ contextMode: 'invalid' }, { contextMode: 'custom', customContextModels: { 'gpt-5.4-mini': 400001 } }, { customContextModels: { 'gpt-5.5': 127999 } }, { customContextModels: { 'gpt-5.5': 1.5 } }, { customContextModels: { absent: 200000 } }, { customContextModels: { 'gpt-5.3-codex-spark': 128000 } }, { customContextModels: { 'gpt-5.6': 500001 } }, { customContextModels: { 'new-model': 220001 } }])('rejects invalid or unsupported writes before persistence: %j', async patch => {
    const f = fixture()
    expect((await f.update(patch)).ok).toBe(false)
    expect(f.edit).not.toHaveBeenCalled()
    expect(f.notify).not.toHaveBeenCalled()
  })
  it('uses the same RPC, validates tool pairing, returns bounded adjacent metadata and preserves other models', async () => {
    const f = fixture()
    await f.update({ contextMode: 'custom', customContextModels: { 'gpt-5.4-mini': 200000 } })
    const result = await f.tool.execute({ action: 'set', contextMode: 'custom', model: 'gpt-5.5', tokens: 800000 }, { signal: new AbortController().signal })
    expect(result).toMatchObject({ contextMode: 'custom', writable: true, truncated: false })
    expect(result.models.find((m: { key: string }) => m.key === 'gpt-5.5')).toMatchObject({ minimum: 128000, maximum: 1000000, effective: 800000, saved: 800000 })
    expect(f.owner.current().models['gpt-5.4-mini']).toBe(200000)
    for (const args of [{ action: 'get', tokens: 200000 }, { action: 'set', contextMode: 'custom', tokens: 200000 }, { action: 'set', contextMode: 'extended', model: 'gpt-5.5', tokens: 200000 }, { action: 'set', contextMode: 'custom', model: 'gpt-5.4-mini', tokens: 1000000 }, { action: 'set', contextMode: 'standard', searchMode: 'live' }]) await expect(f.tool.execute(args, { signal: new AbortController().signal })).rejects.toThrow()
    expect(f.tool.deferLoading).toBe(true)
    // Full parameter schemas stay out of the eager first-turn schema payload.
    expect(JSON.stringify([f.tool].filter(tool => !tool.deferLoading).map(tool => tool.parameters))).toBe(JSON.stringify([]))
    expect(f.tool.isConcurrencySafe({ action: 'set' })).toBe(false)
  })
  it('reports persistence failures and no-ops, rejects cancellation and duplicate writes', async () => {
    const f = fixture()
    f.edit.mockRejectedValueOnce(Error('write failure'))
    expect((await f.update({ contextMode: 'extended' })).ok).toBe(false)
    expect(f.owner.current().mode).toBe('standard')
    expect(f.notify).not.toHaveBeenCalled()
    f.edit.mockImplementationOnce(async () => {})
    expect((await f.update({ contextMode: 'extended' })).ok).toBe(false)
    const abort = new AbortController(); abort.abort()
    await expect(f.update({ contextMode: 'extended' }, abort.signal)).rejects.toThrow()
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const original = f.edit.getMockImplementation()!
    f.edit.mockImplementationOnce(async (...args) => { await pending; await original(...args) })
    const first = f.owner.save({ mode: 'extended', models: {} })
    await expect(f.owner.save({ mode: 'standard', models: {} })).rejects.toThrow('already in progress')
    finish(); await first
    expect(f.owner.current().mode).toBe('extended')
  })
  it('applies schema defaults to partial raw config and rejects corrupt model maps', async () => {
    const f = fixture()
    f.entry.options.config.codexContextLength = { mode: 'custom' }
    expect(f.owner.current()).toEqual({ mode: 'custom', models: {} })
    for (const value of [{ mode: 'bad', models: {} }, { mode: 'custom', models: { 'gpt-5.5': -1 } }, { mode: 'custom', models: { constructor: 200000 } }, { mode: 'standard', models: [] }, { mode: 'standard', models: {}, extra: 'field' }]) {
      f.entry.options.config.codexContextLength = value
      expect(() => f.owner.current()).toThrow('Invalid Codex context configuration')
    }
    expect(f.edit).not.toHaveBeenCalled()
  })
  it('is read-only without the native config editor', async () => {
    const f = fixture()
    const owner = createContextLengthOwner({ get: () => undefined } as never)
    const preferences = f.backend.createPreferences({ owner, settings: f.settings, models: () => models })
    const handler = f.backend.createRpc({ preferences })
    const result = await handler('preferences/update', { contextMode: 'extended' }, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, error: { message: 'Codex context length settings are read-only' } })
    await expect(owner.save({ mode: 'extended', models: {} })).rejects.toThrow('cannot persist')
    expect(f.edit).not.toHaveBeenCalled()
  })
  it('keeps saved preferences for missing models and clamps effective values after a capacity reduction', async () => {
    const f = fixture()
    f.entry.options.config.codexContextLength = { mode: 'custom', models: { archived: 900000, 'new-model': 900000 } }
    expect(f.provider.getModels()[2].contextWindow).toBe(220000)
    await f.update({ customContextModels: { 'gpt-5.5': 200000 } })
    expect(f.owner.current().models).toMatchObject({ archived: 900000, 'new-model': 900000, 'gpt-5.5': 200000 })
    expect(f.preferences.status().contextModels.find((m: { key: string }) => m.key === 'gpt-5.6')).toMatchObject({ maximum: 500000 })
  })
  it('pins each profile’s advertised model budgets even if preferences change before dispatch', async () => {
    const f = fixture()
    const old = f.backend.snapshotProfile({ piProvider: f.provider })
    await f.update({ contextMode: 'extended' })
    const next = f.backend.snapshotProfile({ piProvider: f.provider })
    expect(old.piProvider.getModels()[0].contextWindow).toBe(272000)
    expect(next.piProvider.getModels()[0].contextWindow).toBe(1000000)
    expect(old.piProvider.auth).toBe(f.provider.auth)
  })
  it('does not inherit a template maximum when the server only advertises a smaller context', () => {
    const f = fixture()
    const remote = f.backend.parseOfficialModelCatalog({ models: [{ slug: 'small-new', display_name: 'Small', visibility: 'list', context_window: 64000 }] })[0]
    const merged = f.backend.mergeModel(models, remote)
    expect(merged).toMatchObject({ contextWindow: 64000, maxContextWindow: 64000 })
    const catalog = { getModels: () => [merged] }
    const provider = f.backend.createProvider({ catalog, resolveContextMode: () => 'extended' })
    expect(provider.getModels()[0].contextWindow).toBe(64000)
    const absent = f.backend.mergeModel(models, { id: 'unknown', name: 'Unknown' })
    expect(absent.maxContextWindow).toBeUndefined()
  })
})
