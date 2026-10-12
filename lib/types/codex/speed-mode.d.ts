/** Native configuration owner for the explicitly approved Standard/Fast preference. */
import type { Context } from '@deepseek-ai/cordis';
import { type EnumConfig } from './enum-preference.ts';
export declare const SPEED_MODES: readonly ["standard", "fast"];
export type SpeedMode = typeof SPEED_MODES[number];
export type SpeedModeConfig = EnumConfig<SpeedMode>;
export declare const speedModeSchema: import("@deepseek-ai/schemastery").default<"standard" | "fast", "standard" | "fast">;
export declare function createSpeedModeOwner(ctx: Context, config?: SpeedModeConfig): {
    current: () => "standard" | "fast";
    writable: boolean;
    save(value: "standard" | "fast", signal?: AbortSignal): Promise<void>;
};
