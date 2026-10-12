/** Native configuration owner for the confirmed Codex-only response detail setting. */
import type { Context } from '@deepseek-ai/cordis';
import { type EnumConfig } from './enum-preference.ts';
export declare const OUTPUT_VERBOSITIES: readonly ["default", "low", "medium", "high"];
export type OutputVerbosity = typeof OUTPUT_VERBOSITIES[number];
export type OutputVerbosityConfig = EnumConfig<OutputVerbosity>;
export declare const outputVerbositySchema: import("@deepseek-ai/schemastery").default<"default" | "low" | "medium" | "high", "default" | "low" | "medium" | "high">;
export declare function createOutputVerbosityOwner(ctx: Context, config?: OutputVerbosityConfig): {
    current: () => "default" | "low" | "medium" | "high";
    writable: boolean;
    save(value: "default" | "low" | "medium" | "high", signal?: AbortSignal): Promise<void>;
};
