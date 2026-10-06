/** Subscription route through the user's unmodified Claude Code CLI. */
import type { Context } from '@deepseek-ai/cordis';
import { ClaudeChannelService } from './service.ts';
export interface ClaudeConfig {
    claudeExecutable?: string;
    claudeStreamIdleTimeoutMs?: number;
    claudeUnsupportedFields?: 'error' | 'ignore';
}
export declare function apply(ctx: Context, config?: ClaudeConfig): ClaudeChannelService;
