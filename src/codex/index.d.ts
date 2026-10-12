import type { Context } from '@deepseek-ai/cordis'

export const name: string
export const inject: readonly string[]
export interface CodexBalanceReader {
  call(endpoint: 'status' | 'usage', payload: unknown, signal: AbortSignal): Promise<{ ok: boolean; value?: unknown }>
}
export function apply(ctx: Context, options?: { outputVerbosityOwner?: ReturnType<typeof import('./output-verbosity.ts').createOutputVerbosityOwner>; contextLengthOwner?: ReturnType<typeof import('./context-length.ts').createContextLengthOwner>; speedModeOwner?: ReturnType<typeof import('./speed-mode.ts').createSpeedModeOwner>; imageFeaturesConfig?: import('./image-features.ts').CodexImageFeaturesConfig }): CodexBalanceReader
