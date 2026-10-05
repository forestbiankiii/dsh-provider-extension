/** Read provider-owned public projections; never switch accounts or expose credentials. */
import type { CodexBalanceReader } from '../codex/index.js';
import type { OpenCodeBalanceReader } from '../opencode/index.js';
import type { AntigravityAccountView } from '../antigravity/auth-service.ts';
import type { QuotaStatusView } from '../antigravity/quota.ts';
import type { UsageProviderBalance } from './types.ts';
export interface ProviderBalanceReaders {
    codex?: CodexBalanceReader;
    antigravity?: {
        accounts(): Promise<readonly AntigravityAccountView[]>;
        usageForAccount(id: string, signal?: AbortSignal): Promise<QuotaStatusView>;
    };
    opencode?: OpenCodeBalanceReader;
}
export interface BalanceProvider {
    id: string;
    name: string;
}
export declare function readProviderBalances(providers: readonly BalanceProvider[], readers: ProviderBalanceReaders, signal: AbortSignal): Promise<UsageProviderBalance[]>;
