/** Shared native persistence for the two Codex scalar preferences. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
export type EnumConfig<T extends string> = T | { get(): T }
export function volatileEnum<T extends string>(choices: readonly T[], fallback: T, description: string) {
  const field = (Schema.union(choices) as Schema<T>).default(fallback).description(description)
  // Linked dev schemas may not share the Host's patched Schema prototype.
  ;(field.meta as typeof field.meta & { volatile: boolean }).volatile = true
  return field
}
export function createEnumOwner<T extends string>(ctx: Context, config: EnumConfig<T> | undefined, key: string, choices: readonly T[], fallback: T, label: string) {
  const entry = (ctx.fiber as unknown as { entry?: { options: { config?: Record<string, unknown> } } } | undefined)?.entry
  const editor = ctx.get('configEditor') as { edit(entry: unknown, change: (current: Record<string, unknown>) => Record<string, unknown>): Promise<void> } | undefined
  const current = (): T => {
    const raw = entry?.options.config
    const value = typeof config === 'object' && typeof config?.get === 'function' ? config.get() : raw && Object.hasOwn(raw, key) ? raw[key] : config
    if (value === undefined) return fallback
    if (!choices.includes(value as T)) throw Error(`Invalid ${label} configuration`)
    return value as T
  }
  const writable = entry !== undefined && editor !== undefined
  let saving = false
  return {
    current, writable,
    async save(value: T, signal?: AbortSignal): Promise<void> {
      if (!choices.includes(value)) throw Error(`Invalid ${label} preference`)
      if (!writable) throw Error(`This DSH deployment cannot persist ${label}`)
      if (saving) throw Error(`A ${label} update is already in progress`)
      signal?.throwIfAborted(); saving = true
      try {
        await editor!.edit(entry, previous => ({ ...previous, [key]: value }))
        if (current() !== value) throw Error(`DSH did not accept the ${label} update`)
      } finally { saving = false }
    },
  }
}
