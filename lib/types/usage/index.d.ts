/** Profile-local usage reporting. Logs remain authoritative; credentials never leave Account. */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { Domain } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import type { UsageBalance, UsageBalances, UsagePrice, UsageReport } from './types.ts';
import { type ProviderBalanceReaders } from './provider-balances.ts';
export declare const usageQuerySchema: z.ZodObject<{
    days: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<0>, z.ZodLiteral<7>, z.ZodLiteral<30>, z.ZodLiteral<90>, z.ZodLiteral<365>]>>;
    timezone: z.ZodDefault<z.ZodString>;
    role: z.ZodDefault<z.ZodEnum<{
        all: "all";
        main: "main";
        subagent: "subagent";
    }>>;
    workspace: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const usagePriceSchema: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    currency: z.ZodEnum<{
        CNY: "CNY";
        USD: "USD";
    }>;
    input: z.ZodNumber;
    output: z.ZodNumber;
    cacheRead: z.ZodNullable<z.ZodNumber>;
    cacheWrite: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export declare const usagePricesSchema: z.ZodObject<{
    prices: z.ZodArray<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        currency: z.ZodEnum<{
            CNY: "CNY";
            USD: "USD";
        }>;
        input: z.ZodNumber;
        output: z.ZodNumber;
        cacheRead: z.ZodNullable<z.ZodNumber>;
        cacheWrite: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
declare const priceDomainSpec: {
    readonly name: "provider_extension_usage_prices";
    readonly version: 1;
    readonly global: {
        readonly schema: z.ZodArray<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
            currency: z.ZodEnum<{
                CNY: "CNY";
                USD: "USD";
            }>;
            input: z.ZodNumber;
            output: z.ZodNumber;
            cacheRead: z.ZodNullable<z.ZodNumber>;
            cacheWrite: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
        readonly initial: UsagePrice[];
    };
    readonly tables: {};
};
interface Header {
    id: string;
    createdAt: number;
    cwd?: string;
    parentSession?: string;
    origin?: 'subagent';
}
interface Observation {
    header: Header;
    inheritedEventCount: number;
    cursor: number;
    revision?: string;
    projections?: {
        values: Record<string, unknown>;
    };
    [Symbol.dispose](): void;
}
interface QueryService {
    listSessions(signal?: AbortSignal): Promise<{
        header: Header;
        live: boolean;
        persisted: boolean;
    }[]>;
    observeSession(id: string, options: {
        signal: AbortSignal;
        projectionMode: 'all';
    }): Promise<Observation>;
}
type PriceDomain = Domain<typeof priceDomainSpec>;
/** One application operation owner, consumed equally by the page and the Agent tool. */
export declare class UsageController {
    private readonly ctx;
    private readonly query;
    private readonly balanceReaders;
    private readonly sessions;
    private readonly live;
    private errors;
    private totalSessions;
    private processedSessions;
    private lastScan;
    private scan;
    private readonly lifetime;
    private prices;
    constructor(ctx: Context, query: QueryService, balanceReaders?: () => ProviderBalanceReaders);
    setPriceDomain(domain: PriceDomain | undefined): void;
    update(session: {
        header: Header;
    }, key: string, value: unknown, seq: number): void;
    close(): Promise<void>;
    private refreshHistory;
    private scanHistory;
    report(raw: unknown): UsageReport;
    savePrices(raw: unknown): Promise<{
        prices: UsagePrice[];
    }>;
    balances(raw: unknown, caller?: AbortSignal): Promise<UsageBalances>;
    balance(raw: unknown): Promise<UsageBalance>;
}
export declare function createUsageTool(controller: UsageController): ToolDefinition;
export declare function applyUsage(ctx: Context, balanceReaders?: () => ProviderBalanceReaders): void;
export {};
