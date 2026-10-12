import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';
import type { ConversationNodeDefinition, ConversationController, InputActions, InputState, MessageImageLoader } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProviderPanelKey } from './locales.ts';
export interface CodexImageOutputBlock {
    readonly toolCallId: string;
    readonly content: readonly unknown[];
    readonly isError?: boolean;
    readonly meta?: unknown;
}
export interface CodexImageOutputNode {
    readonly key: string;
    readonly id: string;
    readonly kind: 'codex-image-output';
    readonly target: 'chat';
    readonly location: {
        readonly kind: 'session';
    };
    readonly anchorSeq: number;
    readonly visibility: 'visible';
    readonly data: {
        readonly blocks: readonly CodexImageOutputBlock[];
    };
}
export interface CodexImageOutputNodeOwnerProps {
    readonly node: CodexImageOutputNode;
    readonly loadImage: MessageImageLoader;
}
export interface CodexImageOutputChatNodeProps extends CodexImageOutputNodeOwnerProps {
    readonly rpc: ClientConnectionRpc;
    readonly sessionId: SessionId;
    readonly conversation: Pick<ConversationController, 'createDraftImages' | 'releaseDraftImages'> | undefined;
    readonly isCodexRoute: () => boolean;
    readonly loadImage: MessageImageLoader;
    readonly inputActions: InputActions;
    readonly useInput: SnapshotSelectorHook<InputState>;
    readonly t: Translate<ProviderPanelKey>;
}
export declare const codexImageConversationNode: ConversationNodeDefinition<undefined>;
export declare function CodexImageOutputChatNode(props: CodexImageOutputChatNodeProps): import("react").JSX.Element;
