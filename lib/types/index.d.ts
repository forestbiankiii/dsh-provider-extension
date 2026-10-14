/** Host loader entry for the provider-extension plugin with Antigravity and Codex integrations. */
import type { Context } from '@deepseek-ai/cordis';
import { type ClaudeConfig } from './claude/index.ts';
import Schema from '@deepseek-ai/schemastery';
import { type OutputVerbosityConfig } from './codex/output-verbosity.ts';
import { type ContextLengthConfig } from './codex/context-length.ts';
import { type SpeedModeConfig } from './codex/speed-mode.ts';
import { type CodexImageFeaturesConfig } from './codex/image-features.ts';
import { type CodexSubtasksConfig } from './codex/subtasks.ts';
import { type CompactionModeConfig } from './codex/cloud-compaction.ts';
export declare const name = "provider-extension";
export declare const Config: Schema<Schemastery.ObjectS<{
    codexOutputVerbosity: Schema<"default" | "low" | "medium" | "high", "default" | "low" | "medium" | "high">;
    codexContextLength: Schema<Schemastery.ObjectS<{
        mode: Schema<"standard" | "extended" | "custom", "standard" | "extended" | "custom">;
        tokensK: Schema<number, number>;
        models: Schema<import("@deepseek-ai/cosmokit").Dict<number, string>, import("@deepseek-ai/cosmokit").Dict<number, string>>;
    }>, Schemastery.ObjectT<{
        mode: Schema<"standard" | "extended" | "custom", "standard" | "extended" | "custom">;
        tokensK: Schema<number, number>;
        models: Schema<import("@deepseek-ai/cosmokit").Dict<number, string>, import("@deepseek-ai/cosmokit").Dict<number, string>>;
    }>>;
    codexSpeedMode: Schema<"standard" | "fast", "standard" | "fast">;
    codexImageFeatures: Schema<Schemastery.ObjectS<{
        imageGeneration: Schema<boolean, boolean>;
        imageEditing: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        imageGeneration: Schema<boolean, boolean>;
        imageEditing: Schema<boolean, boolean>;
    }>>;
    codexSubtasks: Schema<"disabled" | "enabled", "disabled" | "enabled">;
    codexCompactionMode: Schema<"dsh" | "cloud", "dsh" | "cloud">;
    claudeExecutable: Schema<string, string>;
    claudeStreamIdleTimeoutMs: Schema<number, number>;
    claudeUnsupportedFields: Schema<"error" | "ignore", "error" | "ignore">;
}>, Schemastery.ObjectT<{
    codexOutputVerbosity: Schema<"default" | "low" | "medium" | "high", "default" | "low" | "medium" | "high">;
    codexContextLength: Schema<Schemastery.ObjectS<{
        mode: Schema<"standard" | "extended" | "custom", "standard" | "extended" | "custom">;
        tokensK: Schema<number, number>;
        models: Schema<import("@deepseek-ai/cosmokit").Dict<number, string>, import("@deepseek-ai/cosmokit").Dict<number, string>>;
    }>, Schemastery.ObjectT<{
        mode: Schema<"standard" | "extended" | "custom", "standard" | "extended" | "custom">;
        tokensK: Schema<number, number>;
        models: Schema<import("@deepseek-ai/cosmokit").Dict<number, string>, import("@deepseek-ai/cosmokit").Dict<number, string>>;
    }>>;
    codexSpeedMode: Schema<"standard" | "fast", "standard" | "fast">;
    codexImageFeatures: Schema<Schemastery.ObjectS<{
        imageGeneration: Schema<boolean, boolean>;
        imageEditing: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        imageGeneration: Schema<boolean, boolean>;
        imageEditing: Schema<boolean, boolean>;
    }>>;
    codexSubtasks: Schema<"disabled" | "enabled", "disabled" | "enabled">;
    codexCompactionMode: Schema<"dsh" | "cloud", "dsh" | "cloud">;
    claudeExecutable: Schema<string, string>;
    claudeStreamIdleTimeoutMs: Schema<number, number>;
    claudeUnsupportedFields: Schema<"error" | "ignore", "error" | "ignore">;
}>>;
export declare const inject: string[];
/** Mount Host-side Antigravity and Codex services, LLM adapters, RPC routes, and tools. */
export declare function apply(ctx: Context, config?: ClaudeConfig & {
    codexOutputVerbosity?: OutputVerbosityConfig;
    codexContextLength?: ContextLengthConfig;
    codexSpeedMode?: SpeedModeConfig;
    codexImageFeatures?: CodexImageFeaturesConfig;
    codexSubtasks?: CodexSubtasksConfig;
    codexCompactionMode?: CompactionModeConfig;
}): void;
export * from './antigravity/index.ts';
export { AntigravitySearchProvider, ANTIGRAVITY_SEARCH_PROVIDER_ID } from './antigravity/search.ts';
export { GENERATE_IMAGE_TOOL_NAME, LIST_IMAGES_TOOL_NAME } from './antigravity/image.ts';
export { ANALYZE_VIDEO_TOOL_NAME } from './antigravity/video.ts';
