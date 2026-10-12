/** Native config owner for the user-controlled Codex image tool switches. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
export interface CodexImageFeatures { imageGeneration: boolean; imageEditing: boolean }
export type CodexImageFeaturesConfig = CodexImageFeatures | { get(): CodexImageFeatures }
const defaults: CodexImageFeatures = { imageGeneration: true, imageEditing: true }
export const codexImageFeaturesSchema = Schema.object({
  imageGeneration: Schema.boolean().default(true),
  imageEditing: Schema.boolean().default(true),
}).description('Whether Codex image generation and editing tools are available.')
;(codexImageFeaturesSchema.meta as typeof codexImageFeaturesSchema.meta & { volatile: boolean }).volatile = true
function normalize(value: unknown): CodexImageFeatures {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid Codex image settings')
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !['imageGeneration', 'imageEditing'].includes(key))
    || record.imageGeneration !== undefined && typeof record.imageGeneration !== 'boolean'
    || record.imageEditing !== undefined && typeof record.imageEditing !== 'boolean') throw Error('Invalid Codex image settings')
  return { imageGeneration: record.imageGeneration === undefined ? true : record.imageGeneration as boolean, imageEditing: record.imageEditing === undefined ? true : record.imageEditing as boolean }
}
export function createCodexImageFeaturesOwner(
  ctx: Context,
  config?: CodexImageFeaturesConfig,
  readLegacy: () => Record<string, unknown> = () => ({}),
) {
  const entry = (ctx.fiber as unknown as { entry?: { options: { config?: Record<string, unknown> } } } | undefined)?.entry
  const editor = ctx.get('configEditor') as { edit(entry: unknown, change: (current: Record<string, unknown>) => Record<string, unknown>): Promise<void> } | undefined
  const configured = () => config && typeof config === 'object' && 'get' in config ? config.get() : config
  const current = (): CodexImageFeatures => {
    const raw = entry?.options.config
    if (raw && Object.hasOwn(raw, 'codexImageFeatures')) return normalize(raw.codexImageFeatures)
    const legacy = readLegacy()
    if (typeof legacy.imageGeneration === 'boolean' || typeof legacy.imageEditing === 'boolean') return normalize({
      imageGeneration: legacy.imageGeneration ?? true,
      imageEditing: legacy.imageEditing ?? true,
    })
    return normalize(configured() ?? defaults)
  }
  const writable = entry !== undefined && editor !== undefined
  let saving = false
  return {
    current, writable,
    async save(input: CodexImageFeatures, signal?: AbortSignal): Promise<void> {
      const value = normalize(input)
      if (!writable) throw Error('This DSH deployment cannot persist Codex image settings')
      if (saving) throw Error('A Codex image setting update is already in progress')
      signal?.throwIfAborted(); saving = true
      try {
        await editor!.edit(entry, previous => ({ ...previous, codexImageFeatures: value }))
        if (JSON.stringify(current()) !== JSON.stringify(value)) throw Error('DSH did not accept the Codex image settings update')
      } finally { saving = false }
    },
  }
}
