import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx';
export interface CodexSubtasksView {
    enabled: boolean;
    writable: boolean;
    available: boolean;
    active: number;
    toolName: string;
}
export declare function requestCodexSubtasks(rpc: CodexVerbosityProps['rpc'], enabled?: boolean, signal?: AbortSignal): Promise<CodexSubtasksView>;
export declare function CodexSubtasksSettings({ rpc, t, subscribe }: CodexVerbosityProps): import("react").JSX.Element;
