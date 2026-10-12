/** Shared native persistence for the two Codex scalar preferences. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export type EnumConfig<T extends string> = T | {
    get(): T;
};
export declare function volatileEnum<T extends string>(choices: readonly T[], fallback: T, description: string): Schema<T, T>;
export declare function createEnumOwner<T extends string>(ctx: Context, config: EnumConfig<T> | undefined, key: string, choices: readonly T[], fallback: T, label: string): {
    current: () => T;
    writable: boolean;
    save(value: T, signal?: AbortSignal): Promise<void>;
};
