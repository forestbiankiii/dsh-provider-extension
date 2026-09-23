/** Owner-only, versioned, multi-account refresh-token persistence with v1 migration. */
export declare const AUTH_RECORD_VERSION: 1;
export declare const MULTI_AUTH_RECORD_VERSION: 2;
export interface AuthRecordDraft {
    readonly refreshToken: string;
    readonly projectId: string;
    readonly email?: string;
    readonly label?: string;
    readonly tier?: string;
    /** Keep the same lineage for a refresh; a new login omits it to fence older work. */
    readonly lineage?: string;
}
export interface AntigravityAuthRecord {
    readonly version: typeof AUTH_RECORD_VERSION;
    readonly refreshToken: string;
    readonly projectId: string;
    readonly email?: string;
    readonly revision: number;
    readonly updatedAt: string;
    /** A per-login lineage fence; absent only on records written by older versions. */
    readonly lineage?: string;
}
export interface AntigravityAccountRecord {
    readonly id: string;
    readonly label: string;
    readonly email?: string | undefined;
    readonly tier?: string | undefined;
    readonly refreshToken: string;
    readonly projectId: string;
    readonly lineage?: string | undefined;
    readonly active: boolean;
    readonly updatedAt: string;
}
export interface AntigravityMultiAuthRecord {
    readonly version: typeof MULTI_AUTH_RECORD_VERSION;
    readonly activeId: string;
    readonly accounts: readonly AntigravityAccountRecord[];
    readonly revision: number;
    readonly updatedAt: string;
}
export interface AuthStoreOptions {
    readonly now?: () => number;
    /** Override process.platform only for deterministic cross-platform tests. */
    readonly platform?: NodeJS.Platform;
}
export interface AntigravityAuthStore {
    /** Return the currently active account as an AntigravityAuthRecord. */
    read(): Promise<AntigravityAuthRecord | undefined>;
    /** Return all saved accounts. */
    readAccounts(): Promise<readonly AntigravityAccountRecord[]>;
    /** Select an active account by id. Returns updated active record. */
    selectAccount(id: string): Promise<AntigravityAuthRecord | undefined>;
    /** Update an account by id (label, tier). Returns updated accounts. */
    updateAccount(id: string, patch: {
        label?: string | undefined;
        tier?: string | undefined;
    }): Promise<readonly AntigravityAccountRecord[]>;
    /** Rename an account by id. Returns updated accounts. */
    renameAccount(id: string, label: string): Promise<readonly AntigravityAccountRecord[]>;
    /** Remove an account by id. Returns remaining accounts. */
    removeAccount(id: string): Promise<readonly AntigravityAccountRecord[]>;
    /** Add or update an account draft. Sets it active and returns its record. */
    commit(draft: AuthRecordDraft): Promise<AntigravityAuthRecord>;
    compareAndCommit(expectedRevision: number, draft: AuthRecordDraft, expectedLineage?: string): Promise<AntigravityAuthRecord | undefined>;
    /** Clear only when the observed record is still the same account lineage. */
    clearIfCurrent(expectedRevision: number, expectedLineage?: string): Promise<boolean>;
    clear(): Promise<void>;
}
export type AuthStoreErrorCode = 'AUTH_STORE_CORRUPT' | 'AUTH_STORE_UNSUPPORTED_VERSION' | 'AUTH_STORE_UNSAFE_PERMISSIONS' | 'AUTH_STORE_CONFLICT' | 'AUTH_STORE_IO';
export declare class AuthStoreError extends Error {
    readonly code: AuthStoreErrorCode;
    constructor(code: AuthStoreErrorCode, message: string);
}
/** Resolve the plugin-owned default path without reading it. */
export declare function defaultAuthStorePath(env?: NodeJS.ProcessEnv, home?: string | undefined, platform?: NodeJS.Platform): string;
/** Create one store supporting both multi-account storage and legacy single-account read contract. */
export declare function createAuthStore(path: string, options?: AuthStoreOptions): AntigravityAuthStore;
/** An offline store useful for tests and process-local bootstrap fixtures. */
export declare function createMemoryAuthStore(initial?: AntigravityAuthRecord, options?: AuthStoreOptions): AntigravityAuthStore;
export declare function writeAuthRecord(path: string, record: AntigravityAuthRecord): Promise<void>;
export declare function writeMultiAuthRecord(path: string, record: AntigravityMultiAuthRecord): Promise<void>;
export declare function makeAuthRecord(draft: AuthRecordDraft, revision: number, now?: number): AntigravityAuthRecord;
