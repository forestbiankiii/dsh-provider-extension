/** A targeted, read-only quota request. Failure must not fall back to another account. */
export interface CodexAccountUsageOptions {
    getAuth(id: string, signal: AbortSignal): Promise<unknown>;
    readCredential(id: string): Promise<unknown>;
    resolveAccountId(credential: Record<string, unknown>): unknown;
    fetch(url: string, init: RequestInit): Promise<Response>;
    parse(value: unknown): unknown;
    url: string | ((accountId: string) => string);
    userAgent: string;
    timeoutMs: number;
}
export declare function readCodexAccountUsage(id: string, options: CodexAccountUsageOptions, signal: AbortSignal): Promise<unknown>;
