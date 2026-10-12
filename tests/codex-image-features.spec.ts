import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createCodexImageFeaturesOwner, codexImageFeaturesSchema, type CodexImageFeatures } from '../src/codex/image-features.ts'
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = (name: string) => source.split(`//#region src/${name}.js\n`)[1]!.split('//#endregion')[0]!
const createRpc = new Function(`${['image-models', 'image-features', 'capability-settings', 'settings-contract', 'preference-fields', 'subscription-rpc'].map(region).join('\n')}\nreturn createSubscriptionRpcHandler`)()
const imageFeatureFunctions = new Function(`${['image-models', 'image-features', 'image-tool-registration'].map(region).join('\n')}\nreturn { watchImageTool, assertImageOperation }`)()
const watchImageTool = imageFeatureFunctions.watchImageTool
const signal = () => new AbortController().signal
function fixture(initial = { imageGeneration: true, imageEditing: true }) {
  const entry = { options: { config: { claudeExecutable: 'preserve', codexOutputVerbosity: 'high' } as Record<string, unknown> } }
  const edit = vi.fn(async (_entry: unknown, change: (raw: Record<string, unknown>) => Record<string, unknown>) => { entry.options.config = change(entry.options.config) })
  const ctx = { fiber: { entry }, get: (key: string) => key === 'configEditor' ? { edit } : undefined }
  const legacy = { ...initial, imageViewer: true }
  const owner = createCodexImageFeaturesOwner(ctx as never, undefined, () => legacy)
  const preferences = {
    status: () => ({ ...owner.current(), imageFeaturesWritable: owner.writable, writable: false }),
    update: vi.fn(async (patch: { imageGeneration?: boolean; imageEditing?: boolean }, abort?: AbortSignal) => owner.save({ ...owner.current(), ...patch }, abort)),
  }
  const handler = createRpc({ preferences })
  return { owner, entry, edit, legacy, preferences, handler }
}
describe('Codex image availability preferences', () => {
  it.each([false, true])('persists independent generation/edit switches, preserving other config; live ref=%s', async live => {
    const f = fixture()
    if (live) {
      const current = () => f.entry.options.config.codexImageFeatures as CodexImageFeatures ?? f.owner.current()
      const owner = createCodexImageFeaturesOwner({ fiber: { entry: f.entry }, get: () => ({ edit: f.edit }) } as never, { get: current }, () => f.legacy)
      const preferences = {
        status: () => ({ ...owner.current(), imageFeaturesWritable: owner.writable }),
        update: async (patch: { imageGeneration?: boolean; imageEditing?: boolean }, abort?: AbortSignal) => owner.save({ ...owner.current(), ...patch }, abort),
      }
      const handler = createRpc({ preferences })
      expect((await handler('preferences/update', { imageGeneration: false }, signal())).value).toMatchObject({ imageGeneration: false, imageEditing: true })
      expect((await handler('preferences/update', { imageEditing: false }, signal())).value).toMatchObject({ imageGeneration: false, imageEditing: false })
    } else {
      expect((codexImageFeaturesSchema.meta as { volatile?: boolean }).volatile).toBe(true)
      expect((await f.handler('preferences/status', {}, signal())).value).toMatchObject({ imageGeneration: true, imageEditing: true, imageFeaturesWritable: true })
      expect((await f.handler('preferences/update', { imageGeneration: false }, signal())).value).toMatchObject({ imageGeneration: false, imageEditing: true })
      expect((await f.handler('preferences/update', { imageEditing: false }, signal())).value).toMatchObject({ imageGeneration: false, imageEditing: false })
    }
    expect(f.entry.options.config).toMatchObject({ claudeExecutable: 'preserve', codexOutputVerbosity: 'high' })
    expect(f.edit).toHaveBeenCalledTimes(2)
    if (!live) expect(f.preferences.update).toHaveBeenCalledTimes(2)
  })
  it('keeps legacy disable values until the user saves the new field', () => {
    const f = fixture({ imageGeneration: false, imageEditing: true })
    expect(f.owner.current()).toEqual({ imageGeneration: false, imageEditing: true })
    expect(Object.hasOwn(f.entry.options.config, 'codexImageFeatures')).toBe(false)
    expect(f.edit).not.toHaveBeenCalled()
  })
  it.each([{ imageGeneration: 'false' }, { imageEditing: 1 }])('rejects invalid settings without saving: %j', async value => {
    const f = fixture()
    expect((await f.handler('preferences/update', value, signal())).ok).toBe(false)
    expect(f.edit).not.toHaveBeenCalled()
  })
  it('shows read-only, cancellation and failed persistence accurately', async () => {
    const readOnly = createCodexImageFeaturesOwner({ get: () => undefined } as never)
    const handler = createRpc({ preferences: { status: () => ({ imageGeneration: true, imageEditing: true, imageFeaturesWritable: false }), update: vi.fn() } })
    expect((await handler('preferences/update', { imageGeneration: false }, signal())).ok).toBe(false)
    await expect(readOnly.save({ imageGeneration: false, imageEditing: true })).rejects.toThrow('cannot persist')
    const f = fixture(); f.edit.mockRejectedValueOnce(Error('disk failed'))
    expect((await f.handler('preferences/update', { imageEditing: false }, signal())).ok).toBe(false)
    expect(f.owner.current()).toEqual({ imageGeneration: true, imageEditing: true })
    const abort = new AbortController(); abort.abort()
    await expect(f.handler('preferences/update', { imageGeneration: false }, abort.signal)).rejects.toThrow()
  })
  it('blocks only the image operation that the user disabled', () => {
    expect(() => imageFeatureFunctions.assertImageOperation({ imageGeneration: false, imageEditing: true }, false)).toThrow('Image generation is disabled')
    expect(() => imageFeatureFunctions.assertImageOperation({ imageGeneration: true, imageEditing: false }, true)).toThrow('Image editing is disabled')
    expect(() => imageFeatureFunctions.assertImageOperation({ imageGeneration: false, imageEditing: true }, true)).not.toThrow()
  })
  it('registers the image tool only while at least one operation is enabled', () => {
    let features = { imageGeneration: true, imageEditing: true }
    let changed!: () => void
    const removed = vi.fn()
    const register = vi.fn(() => removed)
    const settings = { get: () => features, watch: vi.fn((listener: () => void) => { changed = listener; return vi.fn() }) }
    const unsubscribe = vi.fn()
    const dispose = watchImageTool(settings, register, () => features, (listener: () => void) => { changed = listener; return unsubscribe })
    expect(register).toHaveBeenCalledOnce()
    features = { imageGeneration: false, imageEditing: true }; changed()
    expect(removed).not.toHaveBeenCalled()
    features = { imageGeneration: false, imageEditing: false }; changed()
    expect(removed).toHaveBeenCalledOnce()
    features = { imageGeneration: true, imageEditing: false }; changed()
    expect(register).toHaveBeenCalledTimes(2)
    dispose(); expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
