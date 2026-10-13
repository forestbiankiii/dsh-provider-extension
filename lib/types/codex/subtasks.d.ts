/** Opt-in Codex subscription delegation through DSH; no CLI or provider replacement. */
import type { Context } from '@deepseek-ai/cordis';
import { type EnumConfig } from './enum-preference.ts';
export type CodexSubtasksConfig = EnumConfig<'disabled' | 'enabled'>;
export declare const codexSubtasksSchema: import("@deepseek-ai/schemastery").default<"disabled" | "enabled", "disabled" | "enabled">;
export declare const SUBTASK_TOOL = "codex_subtask";
export declare function createCodexSubtasksOwner(ctx: Context, config?: CodexSubtasksConfig): {
    current: () => "disabled" | "enabled";
    writable: boolean;
    save(value: "disabled" | "enabled", signal?: AbortSignal): Promise<void>;
};
export declare function createCodexSubtasks(ctx: any, owner: ReturnType<typeof createCodexSubtasksOwner>): {
    tool: {
        deferLoading: true;
        output: import("@deepseek-ai/dsh-tools").ToolOutputDefinition;
        execute(args: unknown, exec: import("@deepseek-ai/dsh-tools").ToolRunContext): Promise<unknown>;
        finalizeContent?(exec: Readonly<import("@deepseek-ai/dsh-tools").ToolExecution>, result: Readonly<import("@deepseek-ai/dsh-tools").ToolExecutionResult>): import("@deepseek-ai/dsh-llm").ContentBlock[] | undefined;
        timeoutMs?: number;
        isConcurrencySafe?(args: unknown): boolean;
        presentCall?(args: unknown): import("@deepseek-ai/dsh-tools").ToolCallView | undefined;
        presentResult?(args: unknown, result: import("@deepseek-ai/dsh-tools").ToolResult): import("@deepseek-ai/dsh-tools").ToolResultView | undefined;
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
    status: () => {
        enabled: boolean;
        writable: boolean;
        available: boolean;
        active: number;
        toolName: string;
    };
    sync: () => void;
    preference(enabled: boolean, signal?: AbortSignal): Promise<{
        enabled: boolean;
        writable: boolean;
        available: boolean;
        active: number;
        toolName: string;
    }>;
    dispose(): Promise<void>;
};
export declare function mountCodexSubtasks(ctx: Context, owner: ReturnType<typeof createCodexSubtasksOwner>): {
    tool: {
        deferLoading: true;
        output: import("@deepseek-ai/dsh-tools").ToolOutputDefinition;
        execute(args: unknown, exec: import("@deepseek-ai/dsh-tools").ToolRunContext): Promise<unknown>;
        finalizeContent?(exec: Readonly<import("@deepseek-ai/dsh-tools").ToolExecution>, result: Readonly<import("@deepseek-ai/dsh-tools").ToolExecutionResult>): import("@deepseek-ai/dsh-llm").ContentBlock[] | undefined;
        timeoutMs?: number;
        isConcurrencySafe?(args: unknown): boolean;
        presentCall?(args: unknown): import("@deepseek-ai/dsh-tools").ToolCallView | undefined;
        presentResult?(args: unknown, result: import("@deepseek-ai/dsh-tools").ToolResult): import("@deepseek-ai/dsh-tools").ToolResultView | undefined;
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
    status: () => {
        enabled: boolean;
        writable: boolean;
        available: boolean;
        active: number;
        toolName: string;
    };
    sync: () => void;
    preference(enabled: boolean, signal?: AbortSignal): Promise<{
        enabled: boolean;
        writable: boolean;
        available: boolean;
        active: number;
        toolName: string;
    }>;
    dispose(): Promise<void>;
};
