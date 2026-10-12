import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { MessageImageLoader } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProviderPanelKey } from './locales.ts';
export interface CodexOriginalImageRef {
    readonly assetId: string;
    readonly mediaType: 'image/png';
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
    readonly name: string;
    readonly sha256: string;
}
export interface CodexToolCallViewOwnerProps {
    readonly callId: string;
    readonly toolName: string;
    readonly phase: 'preparing' | 'start' | 'result';
    readonly block: {
        readonly meta?: unknown;
        readonly call?: {
            readonly name: string;
            readonly argsRaw: string;
        } | null;
        readonly isError?: boolean;
        readonly content?: readonly unknown[];
    };
    readonly loadImage: MessageImageLoader;
}
export interface CodexOriginalImageToolViewProps extends CodexToolCallViewOwnerProps {
    readonly sessionId: SessionId;
    readonly rpc: ClientConnectionRpc;
    readonly t: Translate<ProviderPanelKey>;
}
export declare function decodeCodexOriginalImageRef(value: unknown): CodexOriginalImageRef | undefined;
export declare function readCodexOriginalImage(rpc: ClientConnectionRpc, sessionId: SessionId, ref: CodexOriginalImageRef, signal: AbortSignal): Promise<Blob>;
export declare function CodexOriginalImageToolView(props: CodexOriginalImageToolViewProps): import("react").JSX.Element;
