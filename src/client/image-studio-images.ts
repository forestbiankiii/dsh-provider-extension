/** Match an erase mask to the admitted clean source, without changing its regions. */
export async function fitEraseMask(file: File, width: number, height: number): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width === width && bitmap.height === height) return file
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image canvas unavailable')
    context.imageSmoothingEnabled = false
    context.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<File>((resolve,reject) => canvas.toBlob(blob => blob
      ? resolve(new File([blob],file.name,{type:'image/png'})) : reject(new Error('Mask encoding failed')), 'image/png'))
  } finally { bitmap.close() }
}
