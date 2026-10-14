/** Experimental wire compression preference; no request is sent when saving. */
import type { CompactionMode } from '../codex/cloud-compaction.ts';
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx';
export declare function requestCodexCompaction(rpc: CodexVerbosityProps['rpc'], value?: CompactionMode, signal?: AbortSignal): Promise<{
    note?: "codexConnectionCloudConflict";
    value: CompactionMode;
    writable: boolean;
}>;
export declare function CodexCompactionSettings(props: CodexVerbosityProps): import("react").JSX.Element;
