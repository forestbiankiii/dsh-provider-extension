import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx';
import type { ContextMode } from '../codex/context-length.ts';
export interface ContextModel {
    key: string;
    label: string;
    minimum: number;
    maximum: number;
    default: number;
    effective: number;
    fixed: boolean;
}
export interface ContextView {
    contextMode: ContextMode;
    customContextModels: Record<string, number>;
    contextModels: ContextModel[];
    writable: boolean;
}
export interface ContextPatch {
    contextMode?: ContextMode;
    customContextModels?: Record<string, number>;
}
export declare function requestCodexContext(rpc: CodexVerbosityProps['rpc'], patch?: ContextPatch, signal?: AbortSignal): Promise<ContextView>;
export declare function CodexContextSettings({ rpc, subscribe, t }: CodexVerbosityProps): import("react").JSX.Element;
