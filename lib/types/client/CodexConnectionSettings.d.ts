/** User-only connection preference. Saving never opens a socket. */
import type { ConnectionMode } from '../codex/connection-mode.ts';
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx';
export declare function requestCodexConnection(rpc: CodexVerbosityProps['rpc'], value?: ConnectionMode, signal?: AbortSignal): Promise<{
    note?: "codexConnectionCloudConflict";
    value: ConnectionMode;
    writable: boolean;
}>;
export declare function CodexConnectionSettings(props: CodexVerbosityProps): import("react").JSX.Element;
