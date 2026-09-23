import type { Context } from '@deepseek-ai/cordis'

export const name: string
export const inject: readonly string[]
export function apply(ctx: Context): void
