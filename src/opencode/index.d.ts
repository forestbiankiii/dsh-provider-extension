import type { Context } from '@deepseek-ai/cordis'

export const name: string
export const inject: readonly string[]
export function apply(ctx: Context, raw?: unknown): void
export const PROVIDER_ID: string
export const DEFAULT_BASE_URL: string
export const DISPLAY_NAME: string
