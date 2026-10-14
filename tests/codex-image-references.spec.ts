import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// Exercise the real image-edit reference resolution without the bundled OAuth runtime.
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = source.split('//#region src/codex-images.js\n')[1]!.split('//#endregion')[0]!
const { editImages, sessionImageReferences, sessionImageMessages } = new Function(`${region}\nreturn { editImages, sessionImageReferences, sessionImageMessages };`)() as {
  editImages(values: unknown[], attachments: any, signal: AbortSignal, messages: unknown[] | undefined): Promise<{ image_url: string }[]>
  sessionImageReferences(messages: unknown[]): Map<string, any>
  sessionImageMessages(session: unknown): unknown[]
}
const digest = (seed: string) => seed.repeat(64).slice(0, 64)
const attachmentId = (seed: string) => `sha256:${digest(seed)}`
const stored = { attachmentId: attachmentId('a'), mediaType: 'image/png', bytes: 2048, width: 400, height: 300, name: 'pasted.png' }
const sessionMessages = [{ role: 'user', content: [{ type: 'text', text: 'use this' }, { type: 'image', attachment: stored }] }]
function fixture() {
  const readImage = vi.fn(async (ref: any) => ({ ref, data: new Uint8Array(16) }))
  return {
    readImage,
    attachments: {
      readImage,
      imageLimits: { maxImageBytes: 200_000, maxImagesPerMessage: 4, maxMessageImageBytes: 400_000, maxImagePixels: 200_000, maxImageDimension: 512, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] },
    },
  }
}
describe('Session image references for Codex edits', () => {
  it('accepts a bare session sha256 id without the model restating stored metadata', async () => {
    const f = fixture()
    const images = await editImages([{ attachmentId: attachmentId('a') }], f.attachments, new AbortController().signal, sessionMessages)
    expect(images).toHaveLength(1)
    expect(images[0]!.image_url).toBe(`data:image/png;base64,${Buffer.from(new Uint8Array(16)).toString('base64')}`)
    // The canonical stored reference is what reaches the attachment service, not the caller's guess.
    expect(f.readImage).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: attachmentId('a'), mediaType: 'image/png', bytes: 2048, width: 400, height: 300 }), expect.anything())
  })
  it('normalizes a bare 64-character digest the same way', async () => {
    const f = fixture()
    await editImages([{ attachmentId: digest('a') }], f.attachments, new AbortController().signal, sessionMessages)
    expect(f.readImage).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: attachmentId('a') }), expect.anything())
  })
  it('ignores contradictory caller metadata instead of trusting it', async () => {
    const f = fixture()
    await editImages([{ attachmentId: attachmentId('a'), mediaType: 'image/jpeg', bytes: 1, width: 1, height: 1 }], f.attachments, new AbortController().signal, sessionMessages)
    expect(f.readImage).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image/png', bytes: 2048, width: 400, height: 300 }), expect.anything())
  })
  it('fails closed for an id that is not in this session and points at the Image handle', async () => {
    const f = fixture()
    await expect(editImages([{ attachmentId: attachmentId('b') }], f.attachments, new AbortController().signal, sessionMessages)).rejects.toThrow('not an image in the current session')
    expect(f.readImage).not.toHaveBeenCalled()
  })
  it('reads nested tool-result images and refuses file paths or filenames', async () => {
    const f = fixture()
    const nested = [{ role: 'tool', content: [{ type: 'tool-result', content: [{ type: 'image', attachment: { ...stored, name: undefined } }] }] }]
    expect(sessionImageReferences(nested).has(attachmentId('a'))).toBe(true)
    await expect(editImages([{ attachmentId: '/tmp/sketch.png' }], f.attachments, new AbortController().signal, sessionMessages)).rejects.toThrow('attachmentId is a file path or filename')
    await expect(editImages([{ attachmentId: 'sketch.png' }], f.attachments, new AbortController().signal, sessionMessages)).rejects.toThrow('attachmentId is a file path or filename')
  })
  it('authorizes an attached image from durable history even when the surface no longer shows it', async () => {
    const f = fixture()
    const imageEvent = { type: 'user/message', seq: 1, data: { role: 'user', content: [{ type: 'image', attachment: stored }] } }
    const noise = { type: 'turn/start', seq: 0, data: { turn: 1 } }
    const summaryEvent = { type: 'user/message', seq: 2, data: { role: 'user', content: [{ type: 'text', text: 'summary' }] } }
    const session = {
      deriveMessages: () => [summaryEvent.data],
      snapshotEvents: () => [noise, imageEvent, summaryEvent],
      deriveEventMessage: (event: { type: string; data: unknown }) => (event.type === 'user/message' ? event.data : null),
    }
    expect(sessionImageMessages(session)).toHaveLength(2)
    // A deriveMessages-only host would have lost the picture during compaction/offload.
    expect(sessionImageReferences(session.deriveMessages()).size).toBe(0)
    await editImages([{ attachmentId: attachmentId('a') }], f.attachments, new AbortController().signal, sessionImageMessages(session))
    expect(f.readImage).toHaveBeenCalledOnce()
  })
  it('returns no messages for a missing session or a host without the session store', () => {
    expect(sessionImageMessages(undefined)).toEqual([])
    expect(sessionImageMessages({ deriveMessages: () => [{ role: 'user', content: [] }] })).toEqual([{ role: 'user', content: [] }])
  })
  it('keeps the complete-reference path working when the host supplies no session messages', async () => {
    const f = fixture()
    await editImages([{ attachmentId: attachmentId('a'), mediaType: 'image/png', bytes: 2048, width: 400, height: 300 }], f.attachments, new AbortController().signal, undefined)
    expect(f.readImage).toHaveBeenCalledOnce()
    await expect(editImages([{ attachmentId: attachmentId('a') }], f.attachments, new AbortController().signal, undefined)).rejects.toThrow('invalid image reference')
  })
})
