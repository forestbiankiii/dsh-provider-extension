/** Standalone DSH model and reasoning-effort panel client plugin. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SlotCore, SlotMap } from '@deepseek-ai/dsh-client-ui-slots';
import { type ModelPanelKey } from './locales.ts';
export { ModelPanel } from './ModelPanel.tsx';
export type { ModelPanelInjected, ModelPanelProps } from './ModelPanel.tsx';
export { CodexAccountsController, isCodexProvider, maskedEmail } from './codexAccounts.ts';
export type { CodexAccountView, CodexAccountsState } from './codexAccounts.ts';
export { accentFor, activeGroup, effortIndex, isCurrentModel, restingEffort, selectionForRow } from './selection.ts';
export type { ModelPanelGroup, ModelPanelModel } from './selection.ts';
export type { ModelPanelKey } from './locales.ts';
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
        modelPanel: ModelPanelKey;
    }
}
export declare const NS = "modelPanel";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
