import { describe, expect, it, vi } from 'vitest'
import { imageConversation, imageInputActions, imageInputState } from '../src/client/codex-image-composer.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

describe('Codex image composer version compatibility', () => {
  it('recognizes both draft ID fields and refuses an unknown composer for edits', () => {
    expect(imageInputState({ imageIds: ['old'] } as never).imageIds).toEqual(['old'])
    expect(imageInputState({ attachmentIds: ['current'] } as never).imageIds).toEqual(['current'])
    expect(imageInputState({} as never).imageIds.length).toBeGreaterThan(0)
  })
  it('binds current attachment actions and session-addressed draft registration', () => {
    const current = { setDraft: vi.fn(), addAttachments: vi.fn(() => true), removeAttachment: vi.fn() }
    const actions = imageInputActions(current as never)
    const id = 'draft-one' as never
    actions.addImages([id]); actions.removeImage(id); actions.setDraft('edit')
    expect(current.addAttachments).toHaveBeenCalledWith([id])
    expect(current.removeAttachment).toHaveBeenCalledWith(id)
    const drafts = [{ id }]
    const native = { createDrafts: vi.fn(() => drafts), releaseDraftAttachments: vi.fn() }
    const composer = imageConversation(native, 'session-1' as SessionId)!
    const files = [] as File[]
    expect(composer.createDraftImages(files)).toBe(drafts)
    expect(native.createDrafts).toHaveBeenCalledWith('session-1', files)
    composer.releaseDraftImages(drafts as never)
    expect(native.releaseDraftAttachments).toHaveBeenCalledWith(drafts)
  })
  it('retains legacy draft registration and does not invent absent methods', () => {
    const old = { createDraftImages: vi.fn(() => []), releaseDraftImages: vi.fn() }
    imageConversation(old, 'session-1' as SessionId)!.createDraftImages([])
    expect(old.createDraftImages).toHaveBeenCalledWith([])
    expect(imageConversation({}, 'session-1' as SessionId)).toBeUndefined()
  })
})
