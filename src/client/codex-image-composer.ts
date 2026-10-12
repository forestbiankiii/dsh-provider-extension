import type { ConversationController, InputActions, InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

type ImageDrafts = ReturnType<ConversationController['createDraftImages']>
type ImageComposer = Pick<ConversationController, 'createDraftImages' | 'releaseDraftImages'>
type CurrentConversation = {
  createDrafts(sessionId: SessionId, files: readonly File[]): ImageDrafts
  releaseDraftAttachments(drafts: ImageDrafts): void
}
type CurrentActions = {
  addAttachments: InputActions['addImages']
  removeAttachment: InputActions['removeImage']
}

/** DSH 0.2 renamed the generic draft API; keep previews independent of that change. */
export function imageInputState(state: InputState): InputState {
  const current = state as InputState & { readonly attachmentIds?: InputState['imageIds'] }
  return { ...state, imageIds: current.attachmentIds ?? current.imageIds ?? ['unsupported-composer' as InputState['imageIds'][number]] }
}
export function imageInputActions(actions: InputActions): Pick<InputActions, 'addImages' | 'removeImage' | 'setDraft'> {
  const current = actions as InputActions & Partial<CurrentActions>
  return {
    setDraft: text => actions.setDraft(text),
    addImages: ids => typeof current.addAttachments === 'function' ? current.addAttachments(ids) : typeof actions.addImages === 'function' ? actions.addImages(ids) : false,
    removeImage: id => { if (typeof current.removeAttachment === 'function') current.removeAttachment(id); else actions.removeImage?.(id) },
  }
}
export function imageConversation(value: unknown, sessionId: SessionId): ImageComposer | undefined {
  if (!value || typeof value !== 'object') return undefined
  const service = value as ImageComposer & Partial<CurrentConversation>
  if (typeof service.createDrafts === 'function' && typeof service.releaseDraftAttachments === 'function') return {
    createDraftImages: files => service.createDrafts!(sessionId, files),
    releaseDraftImages: drafts => service.releaseDraftAttachments!(drafts),
  }
  if (typeof service.createDraftImages === 'function' && typeof service.releaseDraftImages === 'function') return {
    createDraftImages: files => service.createDraftImages(files),
    releaseDraftImages: drafts => service.releaseDraftImages(drafts),
  }
  return undefined
}
