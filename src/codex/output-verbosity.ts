/** Native configuration owner for the confirmed Codex-only response detail setting. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const OUTPUT_VERBOSITIES = ['default', 'low', 'medium', 'high'] as const
export type OutputVerbosity = typeof OUTPUT_VERBOSITIES[number]
export type OutputVerbosityConfig = OutputVerbosity | { get(): OutputVerbosity }
export const outputVerbositySchema = (() => {
  const field = Schema.union(OUTPUT_VERBOSITIES).default('default').description('Codex response detail preference; not a token or length limit.')
  // Cordis' volatile extension stores this metadata; linked dev schemas may not
  // share the Host's patched Schema prototype, so declare the same metadata.
  ;(field.meta as typeof field.meta & { volatile: boolean }).volatile = true
  return field
})()

export function createOutputVerbosityOwner(ctx: Context, config?: OutputVerbosityConfig) {
  const entry = (ctx.fiber as unknown as { entry?: { options: { config?: Record<string, unknown> } } } | undefined)?.entry
  const editor = ctx.get('configEditor') as { edit(entry: unknown, change: (current: Record<string, unknown>) => Record<string, unknown>): Promise<void> } | undefined
  const live = typeof config === 'object' && typeof config?.get === 'function'
  const current = (): OutputVerbosity => {
    // The Loader retains the latest raw config even when a linked older schema
    // produces a primitive rather than the Host's Config reference.
    const raw = entry?.options.config
    const value = live ? config.get() : raw && Object.hasOwn(raw, 'codexOutputVerbosity') ? raw.codexOutputVerbosity : config
    if (value === undefined) return 'default'
    if (!OUTPUT_VERBOSITIES.includes(value as OutputVerbosity)) throw Error('Invalid Codex response detail configuration')
    return value as OutputVerbosity
  }
  const writable = entry !== undefined && editor !== undefined
  let saving = false
  return {
    current, writable,
    async save(value: OutputVerbosity, signal?: AbortSignal): Promise<void> {
      if (!OUTPUT_VERBOSITIES.includes(value)) throw Error('Invalid output verbosity preference')
      if (!writable) throw Error('This DSH deployment cannot persist Codex response detail')
      if (saving) throw Error('A Codex response detail update is already in progress')
      signal?.throwIfAborted()
      saving = true
      try {
        await editor!.edit(entry, previous => ({ ...previous, codexOutputVerbosity: value }))
        if (current() !== value) throw Error('DSH did not accept the Codex response detail update')
      } finally { saving = false }
    },
  }
}
