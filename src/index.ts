/** Host loader entry for the provider-extension plugin with Antigravity and Codex integrations. */

import type { Context } from '@deepseek-ai/cordis'
import { apply as applyAntigravityAuth } from './antigravity/index.ts'
import { apply as applyAntigravitySearch } from './antigravity/search.ts'
import { apply as applyAntigravityImage } from './antigravity/image.ts'
import { apply as applyAntigravityVideo } from './antigravity/video.ts'
import { apply as applyCodexSubscription } from './codex/index.js'

export const name = 'provider-extension'
export const inject = [
  'llm',
  'attachments',
  'credentials',
  'settings',
  'web',
  'loader',
  'tools',
]

/** Mount Host-side Antigravity and Codex services, LLM adapters, RPC routes, and tools. */
export function apply(ctx: Context): void {
  // 1. Mount Antigravity auth service, LLM adapter, loopback RPC, and /antigravity command
  applyAntigravityAuth(ctx)

  // 2. Mount Antigravity web search provider when web service is available
  ctx.inject(['web'], (webCtx) => {
    applyAntigravitySearch(webCtx)
  })

  // 3. Mount Antigravity image generation tools when tools, attachments, and fs are available
  ctx.inject(['tools', 'attachments', 'fs'], (toolsCtx) => {
    applyAntigravityImage(toolsCtx)
  })

  // 4. Mount Antigravity video understanding tool when tools and fs are available
  ctx.inject(['tools', 'fs'], (videoCtx) => {
    applyAntigravityVideo(videoCtx)
  })

  // 5. Mount ChatGPT / Codex subscription service, LLM adapter, account RPC, and tools
  applyCodexSubscription(ctx)
}

export * from './antigravity/index.ts'
export { AntigravitySearchProvider, ANTIGRAVITY_SEARCH_PROVIDER_ID } from './antigravity/search.ts'
export { GENERATE_IMAGE_TOOL_NAME, LIST_IMAGES_TOOL_NAME } from './antigravity/image.ts'
export { ANALYZE_VIDEO_TOOL_NAME } from './antigravity/video.ts'
