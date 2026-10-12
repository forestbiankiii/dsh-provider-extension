import type { ConversationController, InputActions, InputState } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
type ImageComposer = Pick<ConversationController, 'createDraftImages' | 'releaseDraftImages'>;
/** DSH 0.2 renamed the generic draft API; keep previews independent of that change. */
export declare function imageInputState(state: InputState): InputState;
export declare function imageInputActions(actions: InputActions): Pick<InputActions, 'addImages' | 'removeImage' | 'setDraft'>;
export declare function imageConversation(value: unknown, sessionId: SessionId): ImageComposer | undefined;
export {};
