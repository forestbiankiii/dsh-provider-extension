import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx';
import type { ProviderPanelKey } from './locales.ts';
export interface CodexSelectView {
    value: string;
    writable: boolean;
    note?: ProviderPanelKey;
}
interface Props extends CodexVerbosityProps {
    choices: readonly string[];
    labels: readonly ProviderPanelKey[];
    title: ProviderPanelKey;
    hint: ProviderPanelKey;
    savedLabel: ProviderPanelKey;
    load: (rpc: CodexVerbosityProps['rpc'], value?: string, signal?: AbortSignal) => Promise<CodexSelectView>;
}
export declare function CodexSelectSetting({ rpc, subscribe, t, choices, labels, title, hint, savedLabel, load }: Props): import("react").JSX.Element;
export {};
