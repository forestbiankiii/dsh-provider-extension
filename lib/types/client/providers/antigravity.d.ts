/** Client-half controller for Antigravity with multi-account support and quota monitoring. */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { WritableSnapshotStore } from '../store.ts';
export declare const ANTIGRAVITY_PROVIDER: "google-antigravity";
export declare const ANTIGRAVITY_PACKAGE: "dsh-antigravity-auth";
export declare const ANTIGRAVITY_PACKAGE_RANGE: ">=0.1.0";
export declare const ANTIGRAVITY_LOGIN_PHASES: readonly ["idle", "pending", "success", "cancelled", "expired", "port-conflict", "failed"];
export type AntigravityLoginPhase = (typeof ANTIGRAVITY_LOGIN_PHASES)[number];
export interface AntigravityLoginStatus {
    readonly phase: AntigravityLoginPhase;
    readonly configured: boolean;
    readonly projectAvailable: boolean;
    readonly authorizationUrl?: string;
    readonly expiresAt?: string;
    readonly maskedEmail?: string;
    readonly errorCode?: string;
}
export interface AntigravityAccountView {
    readonly id: string;
    readonly label: string;
    readonly email?: string | undefined;
    readonly tier?: string | undefined;
    readonly active: boolean;
}
export type AntigravityQuotaWindow = '5h' | 'weekly';
export interface AntigravityQuotaWindowView {
    readonly window: AntigravityQuotaWindow;
    readonly remainingFraction: number;
    readonly resetTime: string;
}
export interface AntigravityQuotaGroupView {
    readonly group: 'gemini' | 'non-gemini';
    readonly modelCount: number;
    readonly windows: readonly AntigravityQuotaWindowView[];
}
export interface AntigravityQuotaView {
    readonly state: string;
    readonly checkedAt?: string;
    readonly groups?: readonly AntigravityQuotaGroupView[];
}
export interface AntigravityModelEntry {
    readonly id: string;
    readonly name: string;
    readonly state: 'snapshot' | 'live-available' | 'unavailable';
}
export interface AntigravityModelCatalog {
    readonly state: 'snapshot' | 'live-available' | 'refresh-failed' | 'protocol-drift';
    readonly models: readonly AntigravityModelEntry[];
    readonly checkedAt?: string;
}
export interface AntigravityStatus {
    readonly riskAcknowledged: boolean;
    readonly login: AntigravityLoginStatus;
}
export interface AntigravityState {
    /** `absent` means the companion bundle is not installed in this profile. */
    readonly status: 'idle' | 'checking' | 'ready' | 'absent' | 'error';
    readonly view?: AntigravityStatus | undefined;
    readonly accounts: readonly AntigravityAccountView[];
    readonly models?: AntigravityModelCatalog | undefined;
    readonly usage?: Readonly<Record<string, AntigravityQuotaView>> | undefined;
    readonly error?: string | undefined;
    /** True while a login or logout call is in flight. */
    readonly busy?: boolean | undefined;
    /** True while the Host reports a pending browser login. */
    readonly loginPending?: boolean | undefined;
    readonly switchingId?: string | undefined;
}
/** Whether a model-directory route belongs to the Antigravity provider. */
export declare function isAntigravityProvider(provider: string | undefined): boolean;
/** Decode one login status envelope, ignoring unknown optional fields. */
export declare function decodeLoginStatus(value: unknown): AntigravityLoginStatus | undefined;
/** Decode the whole status envelope; `pluginId` proves the companion answered. */
export declare function decodeStatus(value: unknown): AntigravityStatus | undefined;
export declare function decodeAccounts(value: unknown): readonly AntigravityAccountView[];
export declare function decodeAntigravityQuota(value: unknown): AntigravityQuotaView | undefined;
/** Decode the value-free advisory model catalog. */
export declare function decodeModels(value: unknown): AntigravityModelCatalog | undefined;
/** Drive the companion bundle's guarded account RPC. */
export declare class AntigravityController {
    private readonly rpc;
    readonly store: WritableSnapshotStore<AntigravityState>;
    private generation;
    private disposed;
    constructor(rpc: ClientConnectionRpc);
    /** Read status, accounts, models, and quota. */
    load(): Promise<void>;
    /** Switch active Google account by id. */
    selectAccount(id: string): Promise<void>;
    /** Remove one saved Google account. */
    removeAccount(id: string): Promise<void>;
    /** Update label or tier of one saved Google account. */
    updateAccount(id: string, patch: {
        label?: string | undefined;
        tier?: string | undefined;
    }): Promise<void>;
    /** Rename one saved Google account. */
    renameAccount(id: string, label: string): Promise<void>;
    /** Read active or specified account quota/balance. */
    readQuota(id?: string): Promise<void>;
    /** Acknowledge the upstream risk notice and start the Google OAuth flow. */
    login(): Promise<void>;
    /** Drop the stored Antigravity credential. */
    logout(): Promise<void>;
    invalidate(): void;
    dispose(): void;
    private readStatus;
    private readModels;
    private patch;
    private callRaw;
}
