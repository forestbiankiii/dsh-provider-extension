/** Native configuration owner for the confirmed Codex-only response detail setting. */
import type { Context } from '@deepseek-ai/cordis'
import { createEnumOwner, volatileEnum, type EnumConfig } from './enum-preference.ts'
export const OUTPUT_VERBOSITIES = ['default', 'low', 'medium', 'high'] as const
export type OutputVerbosity = typeof OUTPUT_VERBOSITIES[number]
export type OutputVerbosityConfig = EnumConfig<OutputVerbosity>
export const outputVerbositySchema = volatileEnum(OUTPUT_VERBOSITIES, 'default', 'Codex response detail preference; not a token or length limit.')
export function createOutputVerbosityOwner(ctx: Context, config?: OutputVerbosityConfig) {
  return createEnumOwner(ctx, config, 'codexOutputVerbosity', OUTPUT_VERBOSITIES, 'default', 'Codex response detail')
}
