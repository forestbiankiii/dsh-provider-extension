import type { Context } from '@deepseek-ai/cordis'

export const name: string
export const inject: readonly string[]
export interface OpenCodeBalanceReader { readUsage(): Promise<unknown> }
export function apply(ctx: Context, raw?: unknown): OpenCodeBalanceReader
export const PROVIDER_ID: string
export const DEFAULT_BASE_URL: string
export const DISPLAY_NAME: string
