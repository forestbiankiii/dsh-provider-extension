/**
 * Optional integration with the published `dsh-antigravity-auth` capability bundle.
 *
 * That bundle owns the Antigravity OAuth flow, the wire identity, and the LLM
 * adapter that publishes Antigravity model routes into the shared model
 * directory. This module only drives its loopback-guarded account RPC and never
 * handles tokens: the browser receives phases, a login URL, a masked email, and
 * a value-free model catalog.
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import { type WritableSnapshotStore } from '../store.ts';
/** Provider route the upstream adapter registers. */
export declare const ANTIGRAVITY_PROVIDER = "google-antigravity";
/** Package the companion bundle is published as. */
export declare const ANTIGRAVITY_PACKAGE = "dsh-antigravity-auth";
/**
 * Account RPC namespace on the shared `/api` channel. It is intentionally not
 * the package name: the companion registers the shorter `antigravity-auth`.
 */
export declare const ANTIGRAVITY_RPC_NAMESPACE = "antigravity-auth";
/** npm range this integration was written against. */
export declare const ANTIGRAVITY_PACKAGE_RANGE = "0.1.4-rc.1";
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
    readonly models?: AntigravityModelCatalog | undefined;
    readonly error?: string | undefined;
    /** True while a login or logout call is in flight. */
    readonly busy?: boolean | undefined;
    /** True while the Host reports a pending browser login. */
    readonly loginPending?: boolean | undefined;
}
/** Whether a model-directory route belongs to the Antigravity provider. */
export declare function isAntigravityProvider(provider: string | undefined): boolean;
/** Decode one login status envelope, ignoring unknown optional fields. */
export declare function decodeLoginStatus(value: unknown): AntigravityLoginStatus | undefined;
/** Decode the whole status envelope; `pluginId` proves the companion answered. */
export declare function decodeStatus(value: unknown): AntigravityStatus | undefined;
/** Decode the value-free advisory model catalog. */
export declare function decodeModels(value: unknown): AntigravityModelCatalog | undefined;
/** Drive the companion bundle's guarded account RPC. */
export declare class AntigravityController {
    private readonly rpc;
    readonly store: WritableSnapshotStore<AntigravityState>;
    private generation;
    private disposed;
    constructor(rpc: ClientConnectionRpc);
    /** Read status and (when available) the model catalog. */
    load(): Promise<void>;
    /** Acknowledge the upstream risk notice and start the Google OAuth flow. */
    login(): Promise<void>;
    /** Drop the stored Antigravity credential. */
    logout(): Promise<void>;
    invalidate(): void;
    dispose(): void;
    private patch;
    private readStatus;
    private readModels;
    private callRaw;
}
