import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment';
import type { CodexOriginalImageToolViewProps } from './CodexOriginalImageToolView.tsx';
import { imageInputState } from './codex-image-composer.ts';
export declare function imageEditSettings(rpc: ClientConnectionRpc, signal: AbortSignal): Promise<{
    imageEditing: boolean;
    imageAnnotations: boolean;
    imageSketch: boolean;
    limits: ImageAttachmentLimits;
}>;
export declare function assertEmptyImageDraft(props: Pick<CodexOriginalImageToolViewProps, 'isCodexRoute' | 't'>, state: Parameters<typeof imageInputState>[0]): import("@deepseek-ai/dsh-client-ui-conversation/client").InputState;
/** Stage only. Never submit, bypass the edit switch or flatten existing reference chips. */
export declare function commitImageDraft(props: Pick<CodexOriginalImageToolViewProps, 'conversation' | 'inputActions' | 'isCodexRoute' | 't'>, state: Parameters<typeof imageInputState>[0], files: File[], prompt: string): void;
export declare function validateEditFiles(files: File[], limits: ImageAttachmentLimits): Promise<void>;
