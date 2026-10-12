/** One profile-wide Codex context size, capped by each model's catalog maximum. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const CONTEXT_MODES: readonly ["standard", "extended", "custom"];
export type ContextMode = typeof CONTEXT_MODES[number];
export interface ContextLength {
    mode: ContextMode;
    tokensK: number;
    models: Record<string, number>;
}
export type ContextLengthConfig = ContextLength | {
    get(): ContextLength;
};
export declare const contextLengthSchema: Schema<Schemastery.ObjectS<{
    mode: Schema<"standard" | "extended" | "custom", "standard" | "extended" | "custom">;
    tokensK: Schema<number, number>;
    models: Schema<import("@deepseek-ai/cosmokit").Dict<number, string>, import("@deepseek-ai/cosmokit").Dict<number, string>>;
}>, Schemastery.ObjectT<{
    mode: Schema<"standard" | "extended" | "custom", "standard" | "extended" | "custom">;
    tokensK: Schema<number, number>;
    models: Schema<import("@deepseek-ai/cosmokit").Dict<number, string>, import("@deepseek-ai/cosmokit").Dict<number, string>>;
}>>;
export declare function validateContextLength(value: unknown): ContextLength;
export declare function createContextLengthOwner(ctx: Context, config?: ContextLengthConfig): {
    current: () => ContextLength;
    writable: boolean;
    save(input: ContextLength, signal?: AbortSignal): Promise<void>;
};
