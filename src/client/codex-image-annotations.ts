import type { ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment'

export interface CodexImageAnnotation {
  readonly x: number
  readonly y: number
  readonly note: string
}

export function normalizeCodexImageAnnotations(value: readonly CodexImageAnnotation[]): CodexImageAnnotation[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) throw new Error('Add between 1 and 20 image annotations')
  return value.map((annotation, index) => {
    if (!Number.isFinite(annotation.x) || annotation.x < 0 || annotation.x > 1
      || !Number.isFinite(annotation.y) || annotation.y < 0 || annotation.y > 1
      || typeof annotation.note !== 'string' || annotation.note.trim() === '' || annotation.note.length > 500) {
      throw new Error(`Complete the note for image annotation ${index + 1}`)
    }
    return { x: annotation.x, y: annotation.y, note: annotation.note.trim() }
  })
}

interface AnnotationRenderOptions {
  readonly createImageBitmap?: (source: Blob) => Promise<ImageBitmap>
  readonly createCanvas?: (width: number, height: number) => HTMLCanvasElement
  readonly expectedWidth?: number
  readonly expectedHeight?: number
}

function defaultCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  return canvas
}

function encodePng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob)
    else reject(new Error('Could not encode the numbered reference image'))
  }, 'image/png'))
}

function drawPin(context: CanvasRenderingContext2D, number: number, x: number, y: number, width: number, height: number): void {
  const radius = Math.max(8, Math.min(18, Math.round(Math.min(width, height) * 0.02)))
  const edge = radius + 3
  const targetX = x * (width - 1), targetY = y * (height - 1)
  const centerX = Math.max(edge, Math.min(width - edge, targetX))
  const centerY = Math.max(edge, Math.min(height - edge, targetY))
  context.beginPath(); context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.fillStyle = '#e11d48'; context.fill()
  context.lineWidth = 3; context.strokeStyle = '#111827'; context.stroke()
  context.lineWidth = 1.5; context.strokeStyle = '#ffffff'; context.stroke()
  context.fillStyle = '#ffffff'; context.font = `700 ${Math.round(radius * 1.15)}px sans-serif`
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(String(number), centerX, centerY)
}

/** Render a numbered location-reference PNG without changing the clean source Blob. */
export async function createCodexLocationReference(
  source: Blob,
  annotations: readonly CodexImageAnnotation[],
  limits: ImageAttachmentLimits,
  maximumBytes: number,
  options: AnnotationRenderOptions = {},
): Promise<File> {
  const normalized = normalizeCodexImageAnnotations(annotations)
  if (!limits.mediaTypes.includes('image/png') || !Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error('The current image limits do not allow a numbered PNG reference')
  }
  const createBitmap = options.createImageBitmap ?? globalThis.createImageBitmap
  if (typeof createBitmap !== 'function') throw new Error('Image annotation rendering is unavailable in this browser')
  const bitmap = await createBitmap(source)
  try {
    const width = bitmap.width, height = bitmap.height
    if (!Number.isSafeInteger(width) || width < 64 || !Number.isSafeInteger(height) || height < 64) throw new Error('The source image is too small to annotate')
    if (options.expectedWidth !== undefined && options.expectedWidth !== width || options.expectedHeight !== undefined && options.expectedHeight !== height) throw new Error('The displayed source dimensions changed; reopen the image before annotating')
    let scale = Math.min(1, limits.maxImageDimension / width, limits.maxImageDimension / height, Math.sqrt(limits.maxImagePixels / (width * height)))
    const maxBytes = Math.min(maximumBytes, limits.maxImageBytes)
    const makeCanvas = options.createCanvas ?? defaultCanvas
    for (let attempt = 0; attempt < 10 && Math.min(width, height) * scale >= 64; attempt++, scale *= 0.82) {
      const canvas = makeCanvas(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image annotation canvas is unavailable')
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      normalized.forEach((annotation, index) => drawPin(context, index + 1, annotation.x, annotation.y, canvas.width, canvas.height))
      const blob = await encodePng(canvas)
      if (blob.size <= maxBytes) return new File([blob], 'codex-location-reference.png', { type: 'image/png' })
    }
    throw new Error('The numbered reference image cannot fit the current image-size limit')
  } finally {
    bitmap.close?.()
  }
}
