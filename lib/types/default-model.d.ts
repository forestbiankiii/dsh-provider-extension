/** Defaults belong to DSH, not browser preferences or a Session-local model change. */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { CodexBalanceReader } from './codex/index.js';
export interface DefaultModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
export interface DefaultModelView {
    selection: DefaultModelSelection;
    activeAccountId: string | null;
}
/** Shared by the authenticated page route and Agent tool. Never changes an account or Session. */
export declare function createDefaultModelOperation(ctx: Context, reader: () => CodexBalanceReader | undefined): (raw: unknown, signal: AbortSignal) => Promise<DefaultModelView>;
export declare function createDefaultModelTool(operation: ReturnType<typeof createDefaultModelOperation>): ToolDefinition & {
    deferLoading: boolean;
};
export declare function applyDefaultModel(ctx: Context, reader: () => CodexBalanceReader | undefined): void;
