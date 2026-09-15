/** Provider Extension client plugin: owns the composer provider seat and hosts one module per provider. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SlotCore, SlotMap } from '@deepseek-ai/dsh-client-ui-slots';
import { type ProviderPanelKey } from './locales.ts';
export { ProviderPanel } from './ProviderPanel.tsx';
export type { ProviderPanelInjected, ProviderPanelProps } from './ProviderPanel.tsx';
export { CodexAccountsController, decodeQuota, isCodexProvider, maskedEmail } from './providers/codex.ts';
export type { CodexAccountView, CodexAccountsState, CodexQuotaView, CodexUsageState } from './providers/codex.ts';
export { accentFor, activeGroup, effortIndex, isCurrentModel, restingEffort, selectionForRow } from './selection.ts';
export type { ProviderPanelGroup, ProviderPanelModel } from './selection.ts';
export type { ProviderPanelKey } from './locales.ts';
interface SlotsService {
    readonly register: SlotCore['register'];
    inject<K extends keyof SlotMap & string>(name: K, callback: () => () => void): () => void;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        slots: SlotsService;
    }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        providerExtension: ProviderPanelKey;
    }
}
export declare const NS = "providerExtension";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
