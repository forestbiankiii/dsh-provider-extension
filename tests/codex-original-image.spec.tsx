// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexOriginalImageToolView, decodeCodexOriginalImageRef, readCodexOriginalImage, type CodexOriginalImageRef } from '../src/client/CodexOriginalImageToolView.tsx'
import { en } from '../src/client/locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const ref: CodexOriginalImageRef = { assetId: `img_${'a'.repeat(32)}`, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'codex-generated-original.png', sha256: 'b'.repeat(64) }
const meta = { kind: 'codex-subscription-image', schemaVersion: 1, original: ref }
const translation = (key: keyof typeof en, params?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
function props(call: ReturnType<typeof vi.fn>) {
  return {
    callId: 'call-1', toolName: 'codex_image_generate', phase: 'result' as const,
    block: { meta, call: { name: 'codex_image_generate', argsRaw: '{}' }, isError: false, content: [{ type: 'image', attachment: { attachmentId: 'att_1', mediaType: 'image/png', bytes: 4, width: 2, height: 2 } }] },
    loadImage: vi.fn(async () => 'blob:generated-output'), sessionId: 'session-1' as SessionId, rpc: { call } as never, t: translation,
    conversation: { createDraftImages: vi.fn((files: readonly File[]) => files.map((file, index) => ({ id: `draft-${index}`, file }))), releaseDraftImages: vi.fn() } as never,
    inputActions: { setDraft: vi.fn(), addImages: vi.fn(() => true), removeImage: vi.fn(), submit: vi.fn() } as never,
    useInput: ((selector: (state: { draft: string; imageIds: string[]; draftRev: number; phase: 'plain'; occurrences: never[] }) => unknown) => selector({ draft: '', imageIds: [], draftRev: 0, phase: 'plain', occurrences: [] })) as never,
    isCodexRoute: () => true,
  }
}
describe('Codex original-image preview/download', () => {
  it('validates only the durable Codex image reference', () => {
    expect(decodeCodexOriginalImageRef(meta)).toEqual(ref)
    expect(decodeCodexOriginalImageRef({ ...meta, kind: 'other' })).toBeUndefined()
    expect(decodeCodexOriginalImageRef({ ...meta, original: { ...ref, assetId: 'C:\\private\\original.png' } })).toBeUndefined()
    expect(decodeCodexOriginalImageRef({ ...meta, original: { ...ref, bytes: 48 * 1024 * 1024 + 1 } })).toBeUndefined()
  })
  it('reads the authorized PNG through bounded chunks and verifies each chunk', async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({ ok: true, value: { ref, offset: 0, encoded: 'AQIDBA==', done: true } }))
    const blob = await readCodexOriginalImage({ call } as never, 'session-1' as SessionId, ref, new AbortController().signal)
    expect(blob.type).toBe('image/png'); expect(blob.size).toBe(4)
    expect(call).toHaveBeenCalledWith('/api', 'codex-subscription/image/original/chunk', { sessionId: 'session-1', assetId: ref.assetId, offset: 0 }, expect.any(AbortSignal))
    const invalid = vi.fn(async (..._args: unknown[]) => ({ ok: true, value: { ref, offset: 4, encoded: 'AQIDBA==', done: true } }))
    await expect(readCodexOriginalImage({ call: invalid } as never, 'session-1' as SessionId, ref, new AbortController().signal)).rejects.toThrow('Invalid original image chunk')
  })
  it('shows a preview and downloads the stored PNG without making an image-generation request', async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({ ok: true, value: { ref, offset: 0, encoded: 'AQIDBA==', done: true } }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:codex-original')
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<CodexOriginalImageToolView {...props(call)} />)
    expect(await screen.findByRole('img', { name: en.codexImageOutputAlt })).toBeTruthy()
    expect(screen.getByText(en.codexOriginalDimensions.replace('{width}', '2').replace('{height}', '2'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.codexOriginalDownload }))
    await waitFor(() => expect(download).toHaveBeenCalledOnce())
    const fileLink = screen.getByRole('link', { name: en.codexOriginalDownload }) as HTMLAnchorElement
    expect(fileLink.download).toBe(ref.name); expect(fileLink.href).toBe('blob:codex-original')
    fireEvent.click(screen.getByRole('button', { name: en.codexOriginalView }))
    expect(await screen.findByRole('img', { name: en.codexOriginalAlt })).toBeTruthy()
    expect(call).toHaveBeenCalledOnce()
    expect(call.mock.calls[0]).toEqual(['/api', 'codex-subscription/image/original/chunk', { sessionId: 'session-1', assetId: ref.assetId, offset: 0 }, expect.any(AbortSignal)])
  })
  it('restores the image card after remount with current DSH attachmentIds state', async () => {
    const call = vi.fn()
    const currentProps = props(call)
    currentProps.useInput = ((selector: (state: unknown) => unknown) => selector({ draft: '', attachmentIds: [], draftRev: 0, phase: 'plain', occurrences: [] })) as never
    currentProps.inputActions = { setDraft: vi.fn(), addAttachments: vi.fn(() => true), removeAttachment: vi.fn(), submit: vi.fn() } as never
    const first = render(<CodexOriginalImageToolView {...currentProps} />)
    expect(await screen.findByRole('img', { name: en.codexImageOutputAlt })).toBeTruthy()
    first.unmount()
    render(<CodexOriginalImageToolView {...currentProps} />)
    expect(await screen.findByRole('img', { name: en.codexImageOutputAlt })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.codexOriginalView })).toBeTruthy()
    expect(call).not.toHaveBeenCalled()
  })
  it('shows unavailable or failed results without issuing a chunk request', async () => {
    const call = vi.fn()
    const noMetadata = props(call); noMetadata.block = { ...noMetadata.block, meta: undefined }
    render(<CodexOriginalImageToolView {...noMetadata} />)
    expect(screen.getByText(en.codexOriginalUnavailable)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.codexOriginalView })).toBeNull()
    expect(call).not.toHaveBeenCalled()
  })
  it('reports missing host images and leaves the preview hidden', async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({ ok: false, error: { message: 'Original image is unavailable' } }))
    render(<CodexOriginalImageToolView {...props(call)} />)
    fireEvent.click(screen.getByRole('button', { name: en.codexOriginalView }))
    expect((await screen.findByRole('alert')).textContent).toContain('Original image is unavailable')
    expect(screen.queryByRole('img', { name: en.codexOriginalAlt })).toBeNull()
  })
  it('stages clean and numbered-reference images in the Codex composer without sending', async () => {
    const limits = { maxImageBytes: 200_000, maxImagesPerMessage: 4, maxMessageImageBytes: 400_000, maxImagePixels: 1_000_000, maxImageDimension: 512, mediaTypes: ['image/png', 'image/jpeg'] }
    const call = vi.fn(async (..._args: unknown[]) => ({ ok: true, value: { imageGeneration: true, imageEditing: true, imageAnnotations: true, imageLimits: limits } }))
    const viewProps = props(call) as any
    viewProps.block = { ...viewProps.block, content: [{ type: 'image', attachment: { attachmentId: 'att_1', mediaType: 'image/png', bytes: 16_384, width: 128, height: 128 } }] }
    const createdFiles: File[][] = []
    const createDraftImages = vi.fn((files: readonly File[]) => { createdFiles.push([...files]); return files.map((file, index) => ({ id: `draft-${index}`, file })) })
    const addImages = vi.fn(() => true), setDraft = vi.fn(), submit = vi.fn()
    viewProps.conversation = { createDraftImages, releaseDraftImages: vi.fn() }
    viewProps.inputActions = { addImages, setDraft, submit, removeImage: vi.fn() }
    viewProps.useInput = (selector: (state: { draft: string; imageIds: string[]; draftRev: number; phase: 'plain'; occurrences: never[] }) => unknown) => selector({ draft: 'Keep my existing instruction', imageIds: [], draftRev: 1, phase: 'plain', occurrences: [] })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array(512)], { type: 'image/png' }) })))
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 128, height: 128, close: vi.fn() })))
    const canvasContext = { clearRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), save: vi.fn(), restore: vi.fn() }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob([new Uint8Array(128)], { type: 'image/png' })))
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    render(<CodexOriginalImageToolView {...viewProps} />)
    await screen.findByRole('img', { name: en.codexImageOutputAlt })
    fireEvent.click(screen.getByRole('button', { name: en.codexAnnotationStart }))
    const canvas = await screen.findByRole('button', { name: en.codexAnnotationCanvasAria })
    fireEvent.click(canvas, { detail: 1, clientX: 30, clientY: 60 })
    fireEvent.change(screen.getByRole('textbox', { name: /Area 1/u }), { target: { value: 'Repaint the sky' } })
    fireEvent.click(screen.getByRole('button', { name: en.codexAnnotationUse }))
    expect(await screen.findByText(en.codexAnnotationPrepared)).toBeTruthy()
    expect(createDraftImages).toHaveBeenCalledOnce()
    expect(createdFiles[0]?.map(file => file.name)).toEqual(['codex-clean-source.png', 'codex-location-reference.png'])
    expect(addImages).toHaveBeenCalledWith(['draft-0', 'draft-1'])
    expect(setDraft.mock.calls[0]?.[0]).toContain('Keep my existing instruction')
    expect(setDraft.mock.calls[0]?.[0]).toContain('Area 1: x=30% (normalized 0.3000, pixel 38.1 of 128), y=60% (normalized 0.6000, pixel 76.2 of 128); Repaint the sky')
    expect(submit).not.toHaveBeenCalled()
    expect(call).toHaveBeenCalledTimes(2)
  })
  it('honors the edit switch and leaves existing composer images untouched', async () => {
    const limits = { maxImageBytes: 200_000, maxImagesPerMessage: 4, maxMessageImageBytes: 400_000, maxImagePixels: 1_000_000, maxImageDimension: 512, mediaTypes: ['image/png'] }
    const disabledCall = vi.fn(async (..._args: unknown[]) => ({ ok: true, value: { imageEditing: false, imageAnnotations: true, imageLimits: limits } }))
    const disabledProps = props(disabledCall) as any
    disabledProps.block = { ...disabledProps.block, content: [{ type: 'image', attachment: { attachmentId: 'att_1', mediaType: 'image/png', bytes: 16_384, width: 128, height: 128 } }] }
    const disabledAdd = vi.fn(() => true); disabledProps.inputActions.addImages = disabledAdd
    render(<CodexOriginalImageToolView {...disabledProps} />)
    await screen.findByRole('img', { name: en.codexImageOutputAlt })
    fireEvent.click(screen.getByRole('button', { name: en.codexAnnotationStart }))
    expect((await screen.findByRole('alert')).textContent).toContain(en.codexAnnotationFeatureDisabled)
    expect(screen.queryByRole('button', { name: en.codexAnnotationCanvasAria })).toBeNull()
    expect(disabledAdd).not.toHaveBeenCalled()
    cleanup()

    const enabledCall = vi.fn(async (..._args: unknown[]) => ({ ok: true, value: { imageEditing: true, imageAnnotations: true, imageLimits: limits } }))
    const busyProps = props(enabledCall) as any
    busyProps.block = { ...busyProps.block, content: [{ type: 'image', attachment: { attachmentId: 'att_1', mediaType: 'image/png', bytes: 16_384, width: 128, height: 128 } }] }
    busyProps.useInput = (selector: (state: { draft: string; imageIds: string[]; draftRev: number; phase: 'plain'; occurrences: never[] }) => unknown) => selector({ draft: '', imageIds: ['existing-draft-image'], draftRev: 2, phase: 'plain', occurrences: [] })
    const busyAdd = vi.fn(() => true); busyProps.inputActions.addImages = busyAdd
    render(<CodexOriginalImageToolView {...busyProps} />)
    await screen.findByRole('img', { name: en.codexImageOutputAlt })
    fireEvent.click(screen.getByRole('button', { name: en.codexAnnotationStart }))
    expect((await screen.findByRole('alert')).textContent).toContain(en.codexAnnotationComposerBusy)
    expect(screen.queryByRole('button', { name: en.codexAnnotationCanvasAria })).toBeNull()
    expect(busyAdd).not.toHaveBeenCalled()
  })
})
