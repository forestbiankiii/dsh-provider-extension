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
  const owner = createContextLengthOwner(ctx as never, live ? { get: () => entry.options.config.codexContextLength as ContextLength ?? { mode: 'standard', tokensK: 256, models: {} } } : undefined)
  const backend = functions(() => ({ auth: {}, getModels: () => models }), (value: unknown) => value)
  const notify = vi.fn()
  const settings = { get: () => ({ searchMode: 'disabled', speedMode: 'standard' }), update: vi.fn() }
  const preferences = backend.createPreferences({ owner, settings, models: () => models, onChange: notify })
  const handler = backend.createRpc({ preferences: { status: () => ({ ...preferences.status(), searchMode: 'disabled', outputVerbosity: 'high' }), update: preferences.update } })
  const provider = backend.createProvider({ resolveContextMode: () => preferences.current().mode, resolveCustomContextWindow: preferences.resolveWindow })
  return { ctx, entry, edit, owner, preferences, notify, handler, provider, backend, settings, tool: backend.createTool(handler), update: (patch: unknown, signal = new AbortController().signal) => handler('preferences/update', patch, signal) }
}

describe('Codex unified context capacity, persistence and actual model budgets', () => {
  it.each([false, true])('saves one shared K value, preserves legacy maps, and caps each model=%s', async live => {
    const f = fixture(live)
    expect((contextLengthSchema.meta as { volatile?: boolean }).volatile).toBe(true)
    expect(f.preferences.status()).toMatchObject({ contextMode: 'standard', contextLengthK: 256, contextMaximumK: 1000, contextWritable: true })
    expect(f.provider.getModels().map((m: { contextWindow: number }) => m.contextWindow)).toEqual(models.map(m => m.contextWindow))
    expect(f.edit).not.toHaveBeenCalled()
    expect((await f.update({ contextMode: 'extended' })).ok).toBe(true)
    expect(f.provider.getModels().map((m: { contextWindow: number }) => m.contextWindow)).toEqual(models.map(m => m.maxContextWindow))
    expect(f.notify).toHaveBeenCalledOnce(); f.preferences.notify(); expect(f.notify).toHaveBeenCalledOnce()
    expect((await f.update({ contextMode: 'custom', contextLengthK: 600 })).ok).toBe(true)
    expect(f.provider.getModels().map((m: { contextWindow: number }) => m.contextWindow)).toEqual([600000, 400000, 220000, 128000, 600000, 500000])
    expect(f.owner.current()).toMatchObject({ mode: 'custom', tokensK: 600 })
    expect(f.entry.options.config).toMatchObject({ codexOutputVerbosity: 'high', claudeExecutable: 'preserve' })
    expect(f.settings.update).not.toHaveBeenCalled()
    await f.update({ contextMode: 'standard' })
    expect(f.provider.getModels()).toEqual(models)
    expect(f.owner.current().tokensK).toBe(600)
  })
  it.each([{ contextMode: 'invalid' }, { contextLengthK: 127 }, { contextLengthK: 1001 }, { contextLengthK: 256.5 }, { customContextModels: { 'gpt-5.5': 600000 } }])('rejects invalid values and retired per-model edits before persistence: %j', async patch => {
    const f = fixture()
    expect((await f.update(patch)).ok).toBe(false)
    expect(f.edit).not.toHaveBeenCalled(); expect(f.notify).not.toHaveBeenCalled()
  })
  it('uses the same RPC for a bounded get/set tool with a single K value', async () => {
    const f = fixture()
    expect(await f.tool.execute({ action: 'set', contextMode: 'custom', tokensK: 800 }, { signal: new AbortController().signal })).toMatchObject({ contextMode: 'custom', contextLengthK: 800, maximumK: 1000, writable: true })
    expect(await f.tool.execute({ action: 'get' }, { signal: new AbortController().signal })).toMatchObject({ contextMode: 'custom', contextLengthK: 800 })
    expect(f.provider.getModels().map((m: { contextWindow: number }) => m.contextWindow)).toEqual([800000, 400000, 220000, 128000, 800000, 500000])
    for (const args of [{ action: 'get', tokensK: 256 }, { action: 'set', contextMode: 'custom', tokensK: 1001 }, { action: 'set', contextMode: 'extended', tokensK: 300 }, { action: 'set', contextMode: 'custom', model: 'gpt-5.5', tokens: 600000 }]) await expect(f.tool.execute(args, { signal: new AbortController().signal })).rejects.toThrow()
    expect(f.tool.deferLoading).toBe(true); expect(f.tool.isConcurrencySafe({ action: 'set' })).toBe(false)
  })
  it('reports failed/no-op persistence, cancellation, duplicate writes and read-only state', async () => {
    const f = fixture(); f.edit.mockRejectedValueOnce(Error('write failure'))
    expect((await f.update({ contextMode: 'extended' })).ok).toBe(false); expect(f.owner.current().mode).toBe('standard'); expect(f.notify).not.toHaveBeenCalled()
    f.edit.mockImplementationOnce(async () => {})
    expect((await f.update({ contextMode: 'extended' })).ok).toBe(false)
    const abort = new AbortController(); abort.abort(); await expect(f.update({ contextMode: 'extended' }, abort.signal)).rejects.toThrow()
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const original = f.edit.getMockImplementation()!
    f.edit.mockImplementationOnce(async (...args) => { await pending; await original(...args) })
    const first = f.owner.save({ mode: 'extended', tokensK: 256, models: {} })
    await expect(f.owner.save({ mode: 'standard', tokensK: 256, models: {} })).rejects.toThrow('already in progress')
    finish(); await first; expect(f.owner.current().mode).toBe('extended')
    const readonly = createContextLengthOwner({ get: () => undefined } as never)
    expect(readonly.writable).toBe(false); await expect(readonly.save({ mode: 'extended', tokensK: 256, models: {} })).rejects.toThrow('cannot persist')
  })
  it('migrates old per-model values to one conservative K value and preserves old records', async () => {
    const f = fixture()
    f.entry.options.config.codexContextLength = { mode: 'custom', models: { 'gpt-5.5': 600000, 'gpt-5.4-mini': 300000 } }
    expect(f.owner.current()).toMatchObject({ mode: 'custom', tokensK: 300, models: { 'gpt-5.5': 600000, 'gpt-5.4-mini': 300000 } })
    expect(f.provider.getModels().map((m: { contextWindow: number }) => m.contextWindow)).toEqual([300000, 300000, 220000, 128000, 300000, 300000])
    await f.update({ contextMode: 'custom', contextLengthK: 512 })
    expect(f.owner.current()).toMatchObject({ tokensK: 512, models: { 'gpt-5.5': 600000, 'gpt-5.4-mini': 300000 } })
    expect(f.provider.getModels()[0].contextWindow).toBe(512000)
  })
  it('pins per-request capacity snapshots and never inherits another model’s limit', async () => {
    const f = fixture()
    const old = f.backend.snapshotProfile({ piProvider: f.provider })
    await f.update({ contextMode: 'custom', contextLengthK: 600 })
    const next = f.backend.snapshotProfile({ piProvider: f.provider })
    expect(old.piProvider.getModels()[0].contextWindow).toBe(272000); expect(next.piProvider.getModels()[0].contextWindow).toBe(600000)
    const remote = f.backend.parseOfficialModelCatalog({ models: [{ slug: 'small-new', display_name: 'Small', visibility: 'list', context_window: 64000 }] })[0]
    const merged = f.backend.mergeModel(models, remote); expect(merged).toMatchObject({ contextWindow: 64000, maxContextWindow: 64000 })
    const provider = f.backend.createProvider({ catalog: { getModels: () => [merged] }, resolveContextMode: () => 'custom', resolveCustomContextWindow: () => 600000 })
    expect(provider.getModels()[0].contextWindow).toBe(64000)
  })
})
