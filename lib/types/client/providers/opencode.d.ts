/** OpenCode Go client-side controller: configuration, live catalog models, usage polling, and persistence. */
export declare const DEFAULT_OPENCODE_BASE_URL: string;
export declare const OPENCODE_API_KEY_STORAGE_KEY = "dsh-provider-extension:opencode-api-key";
export declare const OPENCODE_BASE_URL_STORAGE_KEY = "dsh-provider-extension:opencode-base-url";
export interface OpencodeUsageWindow {
    readonly status: 'ok' | 'rate-limited';
    readonly percent: number;
    readonly resetsAt: string;
}
export interface OpencodeUsageData {
    readonly rolling?: OpencodeUsageWindow | undefined;
    readonly weekly?: OpencodeUsageWindow | undefined;
    readonly monthly?: OpencodeUsageWindow | undefined;
}
export interface OpencodeModelView {
    readonly id: string;
    readonly name: string;
    readonly contextWindow?: number | undefined;
    readonly maxOutput?: number | undefined;
}
export interface OpencodeState {
    readonly apiKey: string;
    readonly baseURL: string;
    readonly configured: boolean;
    readonly usage?: OpencodeUsageData | undefined;
    readonly usageStatus: 'idle' | 'loading' | 'ready' | 'error';
    readonly usageError?: string | undefined;
    readonly models: readonly OpencodeModelView[];
    readonly modelsStatus: 'idle' | 'loading' | 'ready' | 'error';
}
export declare const DEFAULT_OPENCODE_MODELS: readonly OpencodeModelView[];
export declare function isOpencodeProvider(provider?: string): boolean;
export declare class OpencodeController {
    readonly store: import("../store.ts").WritableSnapshotStore<OpencodeState>;
    private disposed;
    constructor();
    dispose(): void;
    private initFromStorage;
    saveConfig(apiKey: string, baseURL?: string): void;
    readUsage(): Promise<void>;
    refreshModels(): Promise<void>;
}
