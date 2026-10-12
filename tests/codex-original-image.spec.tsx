// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexOriginalImageToolView, decodeCodexOriginalImageRef, readCodexOriginalImage, type CodexOriginalImageRef } from '../src/client/CodexOriginalImageToolView.tsx'
import { en } from '../src/client/locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const ref: CodexOriginalImageRef = { assetId: `img_${'a'.repeat(32)}`, mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'codex-generated-original.png', sha256: 'b'.repeat(64) }
const meta = { kind: 'codex-subscription-image', schemaVersion: 1, original: ref }
const translation = (key: keyof typeof en, params?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
function props(call: ReturnType<typeof vi.fn>) {
  return {
    callId: 'call-1', toolName: 'codex_image_generate', phase: 'result' as const,
    block: { meta, call: { name: 'codex_image_generate', argsRaw: '{}' }, isError: false, content: [{ type: 'image', attachment: { attachmentId: 'att_1', mediaType: 'image/png', bytes: 4, width: 2, height: 2 } }] },
    loadImage: vi.fn(async () => 'blob:generated-output'), sessionId: 'session-1' as SessionId, rpc: { call } as never, t: translation,
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
})
