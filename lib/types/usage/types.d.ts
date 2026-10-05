/** Secret-free usage DTOs shared by the Host report and its Client page. */
export type UsageRole = 'all' | 'main' | 'subagent';
export interface UsageQuery {
    days: 0 | 7 | 30 | 90 | 365;
    timezone: string;
    role: UsageRole;
    workspace?: string;
    provider?: string;
    model?: string;
}
/** Prices per million tokens. No rate means unknown cost, never free usage. */
export interface UsagePrice {
    provider: string;
    model: string;
    currency: 'CNY' | 'USD';
    input: number;
    output: number;
    cacheRead: number | null;
    cacheWrite: number | null;
}
export interface UsageMoney {
    currency: 'CNY' | 'USD';
    amount: number;
    requests: number;
}
export interface UsageMetrics {
    requests: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    retries: number;
    missingUsage: number;
    partialUsage: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    elapsedMs: number;
    timedRequests: number;
    ttftMs: number;
    ttftRequests: number;
    decodeMs: number;
    decodeTokens: number;
    unpricedRequests: number;
    costs: UsageMoney[];
}
export interface UsageRank {
    id: string;
    label: string;
    metrics: UsageMetrics;
    provider?: string;
    model?: string;
}
export interface UsageSession extends UsageRank {
    workspace: string;
    role: Exclude<UsageRole, 'all'>;
    parentSession: string | null;
    updatedAt: number;
}
export interface UsageDaily {
    date: string;
    metrics: UsageMetrics;
}
export interface UsageReport {
    generatedAt: number;
    query: UsageQuery;
    overview: {
        allTime: UsageMetrics;
        today: UsageMetrics;
        month: UsageMetrics;
        period: UsageMetrics;
        activeDays: number;
        streak: number;
        longestStreak: number;
    };
    daily: UsageDaily[];
    providers: UsageRank[];
    models: UsageRank[];
    workspaces: UsageRank[];
    sessions: UsageSession[];
    options: {
        providers: string[];
        models: {
            provider: string;
            model: string;
        }[];
        workspaces: {
            path: string;
            title: string;
        }[];
    };
    coverage: {
        totalSessions: number;
        processedSessions: number;
        failedSessions: number;
        inheritedEventsExcluded: number;
        loading: boolean;
        from: number | null;
        errors: {
            sessionId: string;
            reason: string;
        }[];
    };
    prices: UsagePrice[];
    priceStorage: boolean;
}
export interface UsageQuotaWindow {
    window: '5h' | 'weekly' | 'rolling' | 'monthly';
    group?: 'gemini' | 'non-gemini';
    percent: number;
    kind: 'remaining' | 'reported';
    resetsAt: number | null;
    limited?: boolean;
}
export interface UsageProviderBalance {
    provider: string;
    name: string;
    accountId: string | null;
    label: string;
    active: boolean;
    plan: string | null;
    subscriptionUntil: number | null;
    status: 'ready' | 'signed-out' | 'failed' | 'unsupported' | 'inactive' | 'unavailable';
    checkedAt: number;
    windows: UsageQuotaWindow[];
    credits: string | null;
    unlimitedCredits: boolean;
    resetCredits: number | null;
}
export interface UsageBalances {
    deepseek: UsageBalance;
    providers: UsageProviderBalance[];
}
export interface UsageBalance {
    status: 'ready' | 'signed-out' | 'unavailable' | 'failed';
    wallets: {
        currency: 'CNY' | 'USD';
        balance: string;
    }[];
    bonusWallets: {
        currency: 'CNY' | 'USD';
        balance: string;
    }[];
    checkedAt: number;
    usageUrl: string | null;
}
