import { z } from 'zod';
/** The runtime log is newer than some installed dev typings. Narrow only this boundary. */
export interface UsageEvent {
    type: string;
    seq: number;
    time: number;
    data: unknown;
}
export declare const usageStateSchema: z.ZodObject<{
    inheritedEventCount: z.ZodNumber;
    provider: z.ZodString;
    model: z.ZodString;
    rows: z.ZodArray<z.ZodObject<{
        turn: z.ZodNumber;
        step: z.ZodNumber;
        startedAt: z.ZodNumber;
        endedAt: z.ZodNullable<z.ZodNumber>;
        firstTokenAt: z.ZodNullable<z.ZodNumber>;
        firstVisibleTokenAt: z.ZodNullable<z.ZodNumber>;
        modelEndedAt: z.ZodNullable<z.ZodNumber>;
        provider: z.ZodString;
        model: z.ZodString;
        status: z.ZodEnum<{
            cancelled: "cancelled";
            pending: "pending";
            failed: "failed";
            unknown: "unknown";
            succeeded: "succeeded";
        }>;
        finalized: z.ZodBoolean;
        retries: z.ZodNumber;
        lastRetry: z.ZodNumber;
        usage: z.ZodNullable<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            totalTokens: z.ZodNumber;
            uncachedInputTokens: z.ZodNullable<z.ZodNumber>;
            cacheReadTokens: z.ZodNumber;
            cacheWriteTokens: z.ZodNumber;
            reasoningTokens: z.ZodNumber;
            missingOptional: z.ZodArray<z.ZodEnum<{
                cacheReadTokens: "cacheReadTokens";
                reasoningTokens: "reasoningTokens";
                cacheWriteTokens: "cacheWriteTokens";
            }>>;
        }, z.core.$strict>>;
        missingUsage: z.ZodNumber;
        partial: z.ZodBoolean;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type UsageState = z.infer<typeof usageStateSchema>;
export type UsageStep = UsageState['rows'][number];
/** Headers contain no model in current DSH; optional config supports standalone callers. */
export declare function initUsage(header: {
    createdAt?: number;
    config?: {
        provider?: string;
        model?: string;
    };
}, inheritedEventCount?: number): UsageState;
export declare function applyUsage(state: UsageState, event: UsageEvent): UsageState;
/** Fold the raw log, not Session.surface. Compaction replacement events never subtract consumed tokens. */
export declare function foldUsage(header: Parameters<typeof initUsage>[0], inheritedEventCount: number, events: readonly UsageEvent[]): UsageState;
export declare const snapshotUsage: typeof foldUsage;
export declare const usageProjectionDefinition: {
    key: "providerUsage";
    stateVersion: number;
    stateSchema: z.ZodObject<{
        inheritedEventCount: z.ZodNumber;
        provider: z.ZodString;
        model: z.ZodString;
        rows: z.ZodArray<z.ZodObject<{
            turn: z.ZodNumber;
            step: z.ZodNumber;
            startedAt: z.ZodNumber;
            endedAt: z.ZodNullable<z.ZodNumber>;
            firstTokenAt: z.ZodNullable<z.ZodNumber>;
            firstVisibleTokenAt: z.ZodNullable<z.ZodNumber>;
            modelEndedAt: z.ZodNullable<z.ZodNumber>;
            provider: z.ZodString;
            model: z.ZodString;
            status: z.ZodEnum<{
                cancelled: "cancelled";
                pending: "pending";
                failed: "failed";
                unknown: "unknown";
                succeeded: "succeeded";
            }>;
            finalized: z.ZodBoolean;
            retries: z.ZodNumber;
            lastRetry: z.ZodNumber;
            usage: z.ZodNullable<z.ZodObject<{
                inputTokens: z.ZodNumber;
                outputTokens: z.ZodNumber;
                totalTokens: z.ZodNumber;
                uncachedInputTokens: z.ZodNullable<z.ZodNumber>;
                cacheReadTokens: z.ZodNumber;
                cacheWriteTokens: z.ZodNumber;
                reasoningTokens: z.ZodNumber;
                missingOptional: z.ZodArray<z.ZodEnum<{
                    cacheReadTokens: "cacheReadTokens";
                    reasoningTokens: "reasoningTokens";
                    cacheWriteTokens: "cacheWriteTokens";
                }>>;
            }, z.core.$strict>>;
            missingUsage: z.ZodNumber;
            partial: z.ZodBoolean;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    init: typeof initUsage;
    apply: typeof applyUsage;
    wire: {
        viewSchema: z.ZodObject<{
            inheritedEventCount: z.ZodNumber;
            provider: z.ZodString;
            model: z.ZodString;
            rows: z.ZodArray<z.ZodObject<{
                turn: z.ZodNumber;
                step: z.ZodNumber;
                startedAt: z.ZodNumber;
                endedAt: z.ZodNullable<z.ZodNumber>;
                firstTokenAt: z.ZodNullable<z.ZodNumber>;
                firstVisibleTokenAt: z.ZodNullable<z.ZodNumber>;
                modelEndedAt: z.ZodNullable<z.ZodNumber>;
                provider: z.ZodString;
                model: z.ZodString;
                status: z.ZodEnum<{
                    cancelled: "cancelled";
                    pending: "pending";
                    failed: "failed";
                    unknown: "unknown";
                    succeeded: "succeeded";
                }>;
                finalized: z.ZodBoolean;
                retries: z.ZodNumber;
                lastRetry: z.ZodNumber;
                usage: z.ZodNullable<z.ZodObject<{
                    inputTokens: z.ZodNumber;
                    outputTokens: z.ZodNumber;
                    totalTokens: z.ZodNumber;
                    uncachedInputTokens: z.ZodNullable<z.ZodNumber>;
                    cacheReadTokens: z.ZodNumber;
                    cacheWriteTokens: z.ZodNumber;
                    reasoningTokens: z.ZodNumber;
                    missingOptional: z.ZodArray<z.ZodEnum<{
                        cacheReadTokens: "cacheReadTokens";
                        reasoningTokens: "reasoningTokens";
                        cacheWriteTokens: "cacheWriteTokens";
                    }>>;
                }, z.core.$strict>>;
                missingUsage: z.ZodNumber;
                partial: z.ZodBoolean;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        view: (state: UsageState) => UsageState;
    };
};
