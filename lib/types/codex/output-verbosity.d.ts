/** Native configuration owner for the confirmed Codex-only response detail setting. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const OUTPUT_VERBOSITIES: readonly ["default", "low", "medium", "high"];
export type OutputVerbosity = typeof OUTPUT_VERBOSITIES[number];
export type OutputVerbosityConfig = OutputVerbosity | {
    get(): OutputVerbosity;
};
export declare const outputVerbositySchema: Schema<"default" | "low" | "medium" | "high", "default" | "low" | "medium" | "high">;
export declare function createOutputVerbosityOwner(ctx: Context, config?: OutputVerbosityConfig): {
    current: () => OutputVerbosity;
    writable: boolean;
    save(value: OutputVerbosity, signal?: AbortSignal): Promise<void>;
};
