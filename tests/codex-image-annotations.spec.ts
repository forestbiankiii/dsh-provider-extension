import { describe, expect, it, vi } from 'vitest'
import { createCodexLocationReference, normalizeCodexImageAnnotations } from '../src/client/codex-image-annotations.ts'

const limits = {
  maxImageBytes: 200_000, maxImagesPerMessage: 4, maxMessageImageBytes: 400_000,
  maxImagePixels: 200_000, maxImageDimension: 512, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'],
} as const
function renderOptions(size: (width: number, height: number) => number) {
  const arc = vi.fn(), drawImage = vi.fn(), close = vi.fn()
  const bitmap = { width: 128, height: 96, close }
  const createCanvas = (width: number, height: number) => ({
    width, height,
    getContext: () => ({
      clearRect: vi.fn(), drawImage, beginPath: vi.fn(), arc, fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
      save: vi.fn(), restore: vi.fn(),
    }),
    toBlob: (done: BlobCallback) => done(new Blob([new Uint8Array(size(width, height))], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement)
  return { options: { createImageBitmap: vi.fn(async () => bitmap as unknown as ImageBitmap), createCanvas }, arc, drawImage, close }
}

describe('Codex image region annotations', () => {
  it('validates marker coordinates and requires a short note for each number', () => {
    expect(normalizeCodexImageAnnotations([{ x: 0.25, y: 0.75, note: 'Replace this area' }])).toEqual([{ x: 0.25, y: 0.75, note: 'Replace this area' }])
    expect(() => normalizeCodexImageAnnotations([])).toThrow('between 1 and 20')
    expect(() => normalizeCodexImageAnnotations([{ x: 1.1, y: 0.5, note: 'Change it' }])).toThrow('annotation 1')
    expect(() => normalizeCodexImageAnnotations([{ x: 0.5, y: 0.5, note: '  ' }])).toThrow('annotation 1')
  })
  it('creates a clean-source copy with numbered pins and keeps notes out of the reference image', async () => {
    const fake = renderOptions((width, height) => width * height)
    const file = await createCodexLocationReference(new Blob(['source'], { type: 'image/png' }), [
      { x: 0.2, y: 0.3, note: 'Change roof color' }, { x: 0.8, y: 0.7, note: 'Keep the tree' },
    ], limits, 100_000, fake.options)
    expect(file.name).toBe('codex-location-reference.png')
    expect(file.type).toBe('image/png')
    expect(fake.drawImage).toHaveBeenCalledOnce()
    expect(fake.arc).toHaveBeenCalledTimes(2)
    expect(fake.close).toHaveBeenCalledOnce()
  })
  it('reduces the guide dimensions to fit the remaining message-image budget', async () => {
    const fake = renderOptions((width, height) => width * height)
    const file = await createCodexLocationReference(new Blob(['source']), [{ x: 0.5, y: 0.5, note: 'Add a window' }], limits, 6_000, fake.options)
    expect(file.size).toBeLessThanOrEqual(6_000)
    expect(fake.drawImage.mock.calls.length).toBeGreaterThan(1)
    expect(fake.close).toHaveBeenCalledOnce()
  })
  it('refuses missing PNG support and impossible size limits', async () => {
    await expect(createCodexLocationReference(new Blob(['source']), [{ x: 0.5, y: 0.5, note: 'Edit' }], { ...limits, mediaTypes: ['image/jpeg'] }, 100_000, renderOptions((w, h) => w * h).options)).rejects.toThrow('do not allow')
    await expect(createCodexLocationReference(new Blob(['source']), [{ x: 0.5, y: 0.5, note: 'Edit' }], limits, 1, renderOptions((w, h) => w * h).options)).rejects.toThrow('cannot fit')
  })
})
