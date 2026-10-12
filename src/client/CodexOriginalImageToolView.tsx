/** User-requested preview/download for originals already stored by Codex image calls. */
import { useEffect, useRef, useState } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { MessageImageLoader } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProviderPanelKey } from './locales.ts'
import css from './ProviderPanel.module.css'

const CHUNK_BYTES = 4 * 1024 * 1024
const ORIGINAL_IMAGE_LIMIT = 48 * 1024 * 1024
export interface CodexOriginalImageRef {
  readonly assetId: string
  readonly mediaType: 'image/png'
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly name: string
  readonly sha256: string
}
export interface CodexToolCallViewOwnerProps {
  readonly callId: string
  readonly toolName: string
  readonly phase: 'preparing' | 'start' | 'result'
  readonly block: { readonly meta?: unknown; readonly call?: { readonly name: string; readonly argsRaw: string } | null; readonly isError?: boolean; readonly content?: readonly unknown[] }
  readonly loadImage: MessageImageLoader
}
export interface CodexOriginalImageToolViewProps extends CodexToolCallViewOwnerProps {
  readonly sessionId: SessionId
  readonly rpc: ClientConnectionRpc
  readonly t: Translate<ProviderPanelKey>
}
interface RpcResult { readonly ok?: boolean; readonly value?: unknown; readonly error?: { readonly message?: unknown } }
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
export function decodeCodexOriginalImageRef(value: unknown): CodexOriginalImageRef | undefined {
  const meta = record(value), original = record(meta?.original)
  if (meta?.kind !== 'codex-subscription-image' || meta.schemaVersion !== 1 || original === undefined
    || typeof original.assetId !== 'string' || !/^img_[0-9a-f]{32}$/u.test(original.assetId)
    || original.mediaType !== 'image/png' || !Number.isSafeInteger(original.bytes) || (original.bytes as number) <= 0 || (original.bytes as number) > ORIGINAL_IMAGE_LIMIT
    || !Number.isSafeInteger(original.width) || (original.width as number) <= 0 || !Number.isSafeInteger(original.height) || (original.height as number) <= 0
    || typeof original.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(original.name)
    || typeof original.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(original.sha256)) return undefined
  return { assetId: original.assetId, mediaType: 'image/png', bytes: original.bytes as number, width: original.width as number, height: original.height as number, name: original.name, sha256: original.sha256 }
}
function sameRef(value: unknown, expected: CodexOriginalImageRef): boolean {
  const actual = record(value)
  return actual?.assetId === expected.assetId && actual.mediaType === expected.mediaType && actual.bytes === expected.bytes
    && actual.width === expected.width && actual.height === expected.height && actual.name === expected.name && actual.sha256 === expected.sha256
}
export async function readCodexOriginalImage(rpc: ClientConnectionRpc, sessionId: SessionId, ref: CodexOriginalImageRef, signal: AbortSignal): Promise<Blob> {
  const data = new Uint8Array(ref.bytes)
  for (let offset = 0; offset < ref.bytes;) {
    signal.throwIfAborted()
    const response = await rpc.call('/api', 'codex-subscription/image/original/chunk', { sessionId, assetId: ref.assetId, offset }, signal) as RpcResult
    if (response?.ok !== true) {
      const message = response?.error?.message
      throw new Error(typeof message === 'string' && message.length ? message : 'Could not read the original image')
    }
    const chunk = record(response.value)
    if (!chunk || !sameRef(chunk.ref, ref) || chunk.offset !== offset || typeof chunk.encoded !== 'string' || typeof chunk.done !== 'boolean') throw new Error('Invalid original image chunk')
    const expectedBytes = Math.min(CHUNK_BYTES, ref.bytes - offset)
    if (chunk.encoded.length > Math.ceil(expectedBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(chunk.encoded)) throw new Error('Invalid original image data')
    let binary: string
    try { binary = atob(chunk.encoded) } catch { throw new Error('Invalid original image data') }
    if (binary.length !== expectedBytes || chunk.done !== (offset + expectedBytes === ref.bytes)) throw new Error('Incomplete original image data')
    for (let index = 0; index < binary.length; index++) data[offset + index] = binary.charCodeAt(index)
    offset += binary.length
  }
  signal.throwIfAborted()
  return new Blob([data.buffer as ArrayBuffer], { type: 'image/png' })
}
function resultText(block: CodexOriginalImageToolViewProps['block']): string {
  return (block.content ?? []).map(value => record(value)).filter((value): value is Record<string, unknown> => value?.type === 'text' && typeof value.text === 'string')
    .map(value => value.text as string).join('\n')
}
function outputImage(block: CodexOriginalImageToolViewProps['block']): ImageAttachmentRef | undefined {
  for (const raw of block.content ?? []) {
    const content = record(raw), image = record(content?.attachment)
    if (content?.type === 'image' && typeof image?.attachmentId === 'string' && image.attachmentId.length > 0
      && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(image.mediaType))
      && Number.isSafeInteger(image.bytes) && (image.bytes as number) > 0 && (image.bytes as number) <= ORIGINAL_IMAGE_LIMIT
      && Number.isSafeInteger(image.width) && (image.width as number) > 0 && Number.isSafeInteger(image.height) && (image.height as number) > 0) return image as unknown as ImageAttachmentRef
  }
  return undefined
}
export function CodexOriginalImageToolView(props: CodexOriginalImageToolViewProps) {
  const [url, setUrl] = useState<string>()
  const [outputUrl, setOutputUrl] = useState<string>()
  const [preview, setPreview] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const abort = useRef<AbortController>()
  const loading = useRef(false)
  const blobCache = useRef<Blob>()
  const urlCache = useRef<string>()
  useEffect(() => () => {
    abort.current?.abort()
    if (urlCache.current) URL.revokeObjectURL(urlCache.current)
  }, [props.rpc, props.sessionId])
  const outputRef = outputImage(props.block)
  const outputAttachmentId = outputRef?.attachmentId
  useEffect(() => {
    let active = true
    setOutputUrl(undefined)
    if (outputRef) void props.loadImage(outputRef).then(value => { if (active) setOutputUrl(value) }).catch(() => {})
    return () => { active = false }
  }, [props.loadImage, outputAttachmentId])
  const ref = props.phase === 'result' && !props.block.isError && props.toolName === 'codex_image_generate'
    ? decodeCodexOriginalImageRef(props.block.meta) : undefined
  const message = resultText(props.block)
  const openOriginal = async (download: boolean) => {
    if (!ref || loading.current) return
    loading.current = true; setPending(true); setError(undefined)
    const controller = new AbortController(); abort.current = controller
    try {
      const blob = blobCache.current ?? await readCodexOriginalImage(props.rpc, props.sessionId, ref, controller.signal)
      if (controller.signal.aborted) return
      blobCache.current = blob
      let objectUrl = urlCache.current
      if (!objectUrl) {
        objectUrl = URL.createObjectURL(blob)
        urlCache.current = objectUrl
        setUrl(objectUrl)
      }
      if (download) {
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = ref.name
        anchor.style.display = 'none'
        document.body.append(anchor); anchor.click(); anchor.remove()
      } else setPreview(true)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      loading.current = false
      if (!controller.signal.aborted) setPending(false)
    }
  }
  if (props.phase !== 'result') return <div className={css.codexOriginalImageCard} role="status">{props.t('codexOriginalPending')}</div>
  if (!ref) return <div className={css.codexOriginalImageCard}>
    {outputUrl && <img className={css.codexOriginalOutputPreview} src={outputUrl} alt={props.t('codexImageOutputAlt')} />}
    {props.block.isError ? message || props.t('codexOriginalUnavailable') : props.t('codexOriginalUnavailable')}
  </div>
  return <section className={css.codexOriginalImageCard} aria-label={props.t('codexOriginalTitle')}>
    {outputUrl && <img className={css.codexOriginalOutputPreview} src={outputUrl} alt={props.t('codexImageOutputAlt')} />}
    <div className={css.codexOriginalImageHeader}>
      <strong>{props.t('codexOriginalTitle')}</strong>
      <span>{props.t('codexOriginalDimensions', { width: ref.width, height: ref.height })}</span>
    </div>
    <div className={css.codexOriginalImageActions}>
      <button type="button" className={css.codexOriginalImageButton} disabled={pending} onClick={() => { void openOriginal(false) }}>
        {props.t(preview ? 'codexOriginalShown' : pending ? 'codexOriginalLoading' : 'codexOriginalView')}
      </button>
      {url ? <a className={css.codexOriginalImageButton} href={url} download={ref.name}>{props.t('codexOriginalDownload')}</a>
        : <button type="button" className={css.codexOriginalImageButton} disabled={pending} onClick={() => { void openOriginal(true) }}>
          {props.t(pending ? 'codexOriginalLoading' : 'codexOriginalDownload')}
        </button>}
    </div>
    {preview && url && <img className={css.codexOriginalImagePreview} src={url} alt={props.t('codexOriginalAlt')} />}
    {error && <p className={css.error} role="alert">{error}</p>}
  </section>
}
