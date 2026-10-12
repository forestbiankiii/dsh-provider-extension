/** One profile-wide Codex context size, capped by each model's catalog maximum. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
export const CONTEXT_MODES = ['standard', 'extended', 'custom'] as const
export type ContextMode = typeof CONTEXT_MODES[number]
export interface ContextLength { mode: ContextMode; tokensK: number; models: Record<string, number> }
export type ContextLengthConfig = ContextLength | { get(): ContextLength }
export const contextLengthSchema = Schema.object({
  mode: Schema.union(CONTEXT_MODES).default('standard'),
  tokensK: Schema.natural().min(128).max(16000),
  // Kept only to preserve values written by older per-model versions.
  models: Schema.dict(Schema.natural().min(1).max(16000000)).default({}),
}).default({ mode: 'standard', tokensK: 256, models: {} }).description('One Codex context size in thousands of tokens; model catalog limits still apply.')
;(contextLengthSchema.meta as typeof contextLengthSchema.meta & { volatile: boolean }).volatile = true
export function validateContextLength(value: unknown): ContextLength {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid Codex context configuration')
  const input = value as Partial<ContextLength>
  const mode = input.mode === undefined ? 'standard' : input.mode
  const models = input.models === undefined ? {} : input.models
  if (!CONTEXT_MODES.includes(mode) || Object.keys(input).some(key => !['mode', 'tokensK', 'models'].includes(key))
    || !models || typeof models !== 'object' || Array.isArray(models) || Object.keys(models).length > 64) throw Error('Invalid Codex context configuration')
  const legacySize = Object.values(models).length ? Math.floor(Math.min(...Object.values(models)) / 1000) : 256
  const tokensK = input.tokensK === undefined ? Math.min(16000, Math.max(128, legacySize)) : input.tokensK
  if (!Number.isSafeInteger(tokensK) || tokensK < 128 || tokensK > 16000) throw Error('Invalid Codex context configuration')
  const entries = Object.entries(models).sort(([a], [b]) => a.localeCompare(b))
  if (entries.some(([key, size]) => !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,95}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key) || !Number.isSafeInteger(size) || size <= 0 || size > 16000000)) throw Error('Invalid Codex context configuration')
  return { mode, tokensK, models: Object.fromEntries(entries) }
}
export function createContextLengthOwner(ctx: Context, config?: ContextLengthConfig) {
  const entry = (ctx.fiber as unknown as { entry?: { options: { config?: Record<string, unknown> } } } | undefined)?.entry
  const editor = ctx.get('configEditor') as { edit(entry: unknown, change: (current: Record<string, unknown>) => Record<string, unknown>): Promise<void> } | undefined
  const current = (): ContextLength => {
    const raw = entry?.options.config
    const value = config && 'get' in config ? config.get() : raw && Object.hasOwn(raw, 'codexContextLength') ? raw.codexContextLength : config
    return validateContextLength(value ?? { mode: 'standard', tokensK: 256, models: {} })
  }
  const writable = entry !== undefined && editor !== undefined
  let saving = false
  return {
    current, writable,
    async save(input: ContextLength, signal?: AbortSignal) {
      const value = validateContextLength(input)
      if (!writable) throw Error('This DSH deployment cannot persist Codex context length')
      if (saving) throw Error('A Codex context length update is already in progress')
      signal?.throwIfAborted(); saving = true
      try {
        const next = { ...value, models: current().models }
        await editor!.edit(entry, previous => ({ ...previous, codexContextLength: next }))
        if (current().mode !== next.mode || current().tokensK !== next.tokensK) throw Error('DSH did not accept the Codex context length update')
      } finally { saving = false }
    },
  }
}
