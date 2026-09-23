/** Host loader entry for the provider-extension plugin with Antigravity and Codex integrations. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "provider-extension";
export declare const inject: string[];
/** Mount Host-side Antigravity and Codex services, LLM adapters, RPC routes, and tools. */
export declare function apply(ctx: Context): void;
export * from './antigravity/index.ts';
export { AntigravitySearchProvider, ANTIGRAVITY_SEARCH_PROVIDER_ID } from './antigravity/search.ts';
export { GENERATE_IMAGE_TOOL_NAME, LIST_IMAGES_TOOL_NAME } from './antigravity/image.ts';
export { ANALYZE_VIDEO_TOOL_NAME } from './antigravity/video.ts';
