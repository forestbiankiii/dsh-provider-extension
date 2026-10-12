/** One Codex-wide preference, shared by quick and full Settings views. */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { OutputVerbosity } from '../codex/output-verbosity.ts';
import type { ProviderPanelKey } from './locales.ts';
export interface CodexVerbosityProps {
    rpc: ClientConnectionRpc;
    subscribe?: (listener: () => void) => () => void;
    t: Translate<ProviderPanelKey>;
}
export interface CodexVerbosityView {
    outputVerbosity: OutputVerbosity;
    writable: boolean;
}
export declare function requestCodexVerbosity(rpc: ClientConnectionRpc, value?: OutputVerbosity, signal?: AbortSignal): Promise<CodexVerbosityView>;
export declare function CodexVerbositySettings(props: CodexVerbosityProps): import("react").JSX.Element;
