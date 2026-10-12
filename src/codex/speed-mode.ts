/** Native configuration owner for the explicitly approved Standard/Fast preference. */
import type { Context } from '@deepseek-ai/cordis'
import { createEnumOwner, volatileEnum, type EnumConfig } from './enum-preference.ts'
export const SPEED_MODES = ['standard', 'fast'] as const
export type SpeedMode = typeof SPEED_MODES[number]
export type SpeedModeConfig = EnumConfig<SpeedMode>
export const speedModeSchema = volatileEnum(SPEED_MODES, 'standard', 'Codex Standard/Fast preference; supported models only. Fast may consume subscription quota faster.')
export function createSpeedModeOwner(ctx: Context, config?: SpeedModeConfig) {
  return createEnumOwner(ctx, config, 'codexSpeedMode', SPEED_MODES, 'standard', 'Codex speed mode')
}
