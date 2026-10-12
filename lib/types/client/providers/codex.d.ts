/** Optional, secret-free integration with dsh-codex-subscription 2.x account and quota RPC. */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
export interface CodexAccountView {
    readonly id: string;
    readonly label: string;
    readonly active: boolean;
    readonly email?: string;
    readonly expiresAt?: number;
    readonly planType?: string;
    readonly accountId?: string;
    readonly userId?: string;
    readonly subscriptionUntil?: string;
}
/** Provider-reported windows, Credits and spending cap for one account. */
export interface CodexQuotaWindow {
    readonly windowSeconds: number;
    readonly usedPercent?: number;
    readonly remainingPercent: number;
    readonly resetsAt?: number;
}
export interface CodexRateLimit {
    readonly id: string;
    readonly name?: string;
    readonly windows: readonly CodexQuotaWindow[];
}
export interface CodexQuotaView {
    readonly weeklyPercent?: number;
    readonly weeklyResetsAt?: number;
    readonly shortPercent?: number;
    readonly shortResetsAt?: number;
    readonly additionalRateLimits?: readonly CodexRateLimit[];
    readonly credits?: {
        readonly balance?: string;
        readonly unlimited: boolean;
    };
    readonly individualLimit?: {
        readonly limit: string;
        readonly used: string;
        readonly remainingPercent: number;
        readonly resetsAt?: number;
    };
    readonly spendControlReached?: boolean;
    readonly resetCredits?: number;
}
export type CodexUsageState = {
    readonly status: 'loading';
} | {
    readonly status: 'ready';
    readonly value: CodexQuotaView;
} | {
    readonly status: 'error';
    readonly message: string;
};
export interface CodexAccountsState {
    readonly status: 'idle' | 'loading' | 'ready' | 'error';
    readonly accounts: readonly CodexAccountView[];
    readonly error: string | null;
    /** Account id of an in-flight switch or quota read. */
    readonly switchingId?: string | undefined;
    /** Per-account quota, keyed by account id. */
    readonly usage: Readonly<Record<string, CodexUsageState>>;
    /** True when a temporary switch could not be reverted to the previous account. */
    readonly restoreFailed: boolean;
    readonly loginPending?: boolean | undefined;
    readonly loginUrl?: string | undefined;
}
/**
 * Read the reported quota windows out of one `usage` response.
 * Only provider-reported values are returned; nothing is inferred.
 * @param value - the `codex-subscription/usage` payload.
 * @returns only the quota, Credits and spending-limit fields the provider reported.
 */
export declare function decodeQuota(value: unknown): CodexQuotaView;
/** Whether a model-directory route belongs to the Codex subscription provider. */
export declare function isCodexProvider(provider: string | undefined): boolean;
/** Hide account email local parts in the composer while keeping rows distinguishable. */
export declare function maskedEmail(email: string | undefined): string | undefined;
/**
 * Root-scoped Codex account roster, real active-account switching, and quota reads.
 *
 * The upstream `usage` endpoint only reports the currently active account, so a
 * non-active account's quota needs a temporary switch that is reverted immediately.
 */
export declare class CodexAccountsController {
    private readonly rpc;
    readonly store: import("../store.ts").WritableSnapshotStore<CodexAccountsState>;
    private generation;
    private disposed;
    constructor(rpc: ClientConnectionRpc);
    /** Load the roster, then read the active account's quota. */
    load(): Promise<void>;
    /**
     * Read the active account's quota. Never changes which account is active.
     * @param generation - operation allowed to publish the result.
     */
    loadUsage(generation?: number): Promise<void>;
    /** Wait for the Host's online catalog before a surface reads its directory. */
    refreshModels(): Promise<void>;
    /** Read one account's own model catalog directly, without switching the active account. */
    readAccountModels(id: string): Promise<readonly {
        id: string;
        name: string;
    }[]>;
    /** Permanently switch the active account and read its quota. */
    select(id: string): Promise<void>;
    /**
     * Read one account's quota, switching to it first and restoring the previous
     * account immediately afterwards. The active account is left unchanged unless
     * the restore itself fails, which the state then reports.
     * @param id - DSH-local account identity to measure.
     */
    readQuota(id: string): Promise<void>;
    /** Start interactive ChatGPT OAuth login and wait for completion. */
    login(): Promise<void>;
    /** Rename one saved ChatGPT account. */
    renameAccount(id: string, label: string): Promise<void>;
    /** Refresh after an explicit account-bound reset without switching inference accounts. */
    readQuotaForAccount(id: string): Promise<void>;
    /** Remove one saved ChatGPT account. */
    removeAccount(id: string): Promise<void>;
    /** Reload the roster only when a surface already asked for it. */
    invalidate(): void;
    dispose(): void;
    private switchTo;
    private setUsage;
}
