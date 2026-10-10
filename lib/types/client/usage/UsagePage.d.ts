import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { UsagePrice } from '../../usage/types.ts';
import type { UsageKey } from './locales.ts';
/** Presentation only: calculations and report DTOs retain their original Token counts. */
export declare function formatTokenCount(value: number, locale?: string): string;
export interface UsagePageProps {
    rpc: ClientConnectionRpc;
    t: Translate<UsageKey>;
    language: () => string;
}
/** Calendar dates rather than 24-hour offsets keep the heatmap correct across DST. */
export declare function calendarDays(end: string, count: number): string[];
export declare function heatmapDayCount(width: number): number;
export declare function UsagePage({ rpc, t, language }: UsagePageProps): import("react").JSX.Element;
type Draft = {
    provider: string;
    model: string;
    currency: 'CNY' | 'USD';
    input: string;
    output: string;
    cacheRead: string;
    cacheWrite: string;
};
export declare function parsePrices(drafts: Draft[], existing: UsagePrice[]): UsagePrice[];
export {};
