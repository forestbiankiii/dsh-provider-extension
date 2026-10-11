import type { Context } from '@deepseek-ai/cordis'

export const name: string
export const inject: readonly string[]
export interface CodexBalanceReader {
  call(endpoint: 'status' | 'usage', payload: unknown, signal: AbortSignal): Promise<{ ok: boolean; value?: unknown }>
}
export function apply(ctx: Context): CodexBalanceReader
