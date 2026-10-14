import type { Context } from '@deepseek-ai/cordis';
import { type EnumConfig } from './enum-preference.ts';
export type CompactionMode = 'dsh' | 'cloud';
export type CompactionModeConfig = EnumConfig<CompactionMode>;
export declare const compactionModeSchema: import("@deepseek-ai/schemastery").default<"cloud" | "dsh", "cloud" | "dsh">;
export declare const createCompactionModeOwner: (ctx: Context, config?: CompactionModeConfig) => {
    current: () => CompactionMode;
    writable: boolean;
    save(value: CompactionMode, signal?: AbortSignal): Promise<void>;
};
export declare const CLOUD_CHECKPOINT = "dpeCodexCloudCompactionV1";
export declare function createCloudCompaction({ enabled, accountScope, accountForToken, now }: {
    enabled: () => boolean;
    accountScope: (options: any) => Promise<string | undefined>;
    accountForToken: (token: string | undefined) => string | undefined;
    now?: () => number;
}): {
    wrapAdapter<T extends object>(adapter: T): T;
    preparePayload(payload: any, contextWindow: number, token: string | undefined, context: any, model: any, convertPrefix: (context: any, count: number, model: any) => Promise<any[]>): Promise<any>;
    observeResponse(response: Response, input: any): Response;
    requestOptions(options: any): any;
};
