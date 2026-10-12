/** Provider Extension client plugin: owns the composer provider seat and hosts one module per provider. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { SlotCore, SlotMap } from '@deepseek-ai/dsh-client-ui-slots';
import { type CodexOriginalImageToolViewProps, type CodexToolCallViewOwnerProps } from './CodexOriginalImageToolView.tsx';
import { type CodexImageOutputNodeOwnerProps } from './codex-image-output-node.tsx';
import { type ProviderPanelKey } from './locales.ts';
export { ProviderPanel } from './ProviderPanel.tsx';
export type { ProviderPanelInjected, ProviderPanelProps } from './ProviderPanel.tsx';
export { ProviderSettings } from './ProviderSettings.tsx';
export type { ProviderSettingsInjected, ProviderSettingsProps } from './ProviderSettings.tsx';
export { CodexAccountsController, decodeQuota, isCodexProvider, maskedEmail } from './providers/codex.ts';
export type { CodexAccountView, CodexAccountsState, CodexQuotaView, CodexUsageState } from './providers/codex.ts';
export { AntigravityController, decodeModels, decodeStatus, isAntigravityProvider } from './providers/antigravity.ts';
export type { AntigravityModelCatalog, AntigravityState, AntigravityStatus } from './providers/antigravity.ts';
export { OpencodeController, isOpencodeProvider } from './providers/opencode.ts';
export type { OpencodeModelView, OpencodeState, OpencodeUsageData, OpencodeUsageWindow } from './providers/opencode.ts';
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
    interface SlotMap {
        'tool.call.toolview': {
            kind: 'keyed';
            scope: 'session';
            owner: CodexToolCallViewOwnerProps;
            inject: {
                rpc: ClientConnectionRpc;
                sessionId: SessionId;
                conversation: CodexOriginalImageToolViewProps['conversation'];
                isCodexRoute: () => boolean;
            };
        };
        'conversation.chat.node': {
            kind: 'keyed';
            scope: 'session';
            owner: CodexImageOutputNodeOwnerProps;
            inject: {
                rpc: ClientConnectionRpc;
                sessionId: SessionId;
                conversation: CodexOriginalImageToolViewProps['conversation'];
                isCodexRoute: () => boolean;
            };
        };
    }
}
export declare const NS = "providerExtension";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
