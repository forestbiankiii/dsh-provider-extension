/** Only the confirmed Standard/Fast preference; no changes to reasoning or routing. */
import type { SpeedMode } from '../codex/speed-mode.ts';
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx';
export interface CodexSpeedView {
    speedMode: SpeedMode;
    writable: boolean;
    fastModels: string[];
}
export declare function requestCodexSpeed(rpc: CodexVerbosityProps['rpc'], value?: SpeedMode, signal?: AbortSignal): Promise<CodexSpeedView>;
export declare function CodexSpeedSettings(props: CodexVerbosityProps): import("react").JSX.Element;
