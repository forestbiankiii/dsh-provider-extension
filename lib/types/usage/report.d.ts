import type { UsageState } from './fold.js';
import type { UsagePrice, UsageQuery, UsageReport } from './types.js';
export interface UsageReportSession {
    header: {
        id: string;
        cwd?: string;
        parentSession?: string;
        origin?: 'subagent';
        createdAt: number;
    };
    title: string;
    state: UsageState;
}
export type AggregatedUsageReport = Omit<UsageReport, 'coverage' | 'priceStorage'>;
/** Own raw-log rows only: parent sessions never receive their children's consumption again. */
export declare function aggregateUsage(sessions: readonly UsageReportSession[], query: UsageQuery, prices: readonly UsagePrice[], options?: {
    now?: number;
    workspaceTitles?: Map<string, string>;
}): AggregatedUsageReport;
export declare const buildUsageReport: typeof aggregateUsage;
