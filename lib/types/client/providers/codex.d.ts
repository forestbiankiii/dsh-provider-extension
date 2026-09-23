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
/** Quota windows the subscription plugin reported for one account. */
export interface CodexQuotaView {
    /** Remaining percent of the weekly (604800s) window, when reported. */
    readonly weeklyPercent?: number;
    /** Unix seconds when that weekly window resets, when reported. */
    readonly weeklyResetsAt?: number;
    /** Remaining percent of the 5-hour (18000s) window, when reported. */
    readonly shortPercent?: number;
    /** Unix seconds when that 5-hour window resets, when reported. */
    readonly shortResetsAt?: number;
    /** Number of quota reset credits available. */
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
 * @returns the weekly and 5-hour windows when the account reported them.
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
    /** Consume one quota reset credit for an account. */
    consumeResetCredit(id: string): Promise<void>;
    /** Remove one saved ChatGPT account. */
    removeAccount(id: string): Promise<void>;
    /** Reload the roster only when a surface already asked for it. */
    invalidate(): void;
    dispose(): void;
    private switchTo;
    private setUsage;
}
