import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx';
import type { ContextMode } from '../codex/context-length.ts';
export interface ContextView {
    contextMode: ContextMode;
    contextLengthK: number;
    contextMaximumK: number;
    writable: boolean;
}
export interface ContextPatch {
    contextMode?: ContextMode;
    contextLengthK?: number;
}
export declare function requestCodexContext(rpc: CodexVerbosityProps['rpc'], patch?: ContextPatch, signal?: AbortSignal): Promise<ContextView>;
export declare function CodexContextSettings({ rpc, subscribe, t }: CodexVerbosityProps): import("react").JSX.Element;
