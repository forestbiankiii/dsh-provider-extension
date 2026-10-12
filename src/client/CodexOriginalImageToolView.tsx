/** User-requested preview/download for originals already stored by Codex image calls. */
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ImageAttachmentLimits, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import type { ConversationController, InputActions, InputState, MessageImageLoader } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createCodexLocationReference, normalizeCodexImageAnnotations, type CodexImageAnnotation } from './codex-image-annotations.ts'
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
  readonly conversation: Pick<ConversationController, 'createDraftImages' | 'releaseDraftImages'> | undefined
  readonly inputActions: InputActions
  readonly useInput: SnapshotSelectorHook<InputState>
  readonly isCodexRoute: () => boolean
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
interface AnnotationSettings { readonly imageEditing: boolean; readonly imageAnnotations: boolean; readonly imageLimits: ImageAttachmentLimits }
function decodeImageAttachmentLimits(value: unknown): ImageAttachmentLimits | undefined {
  const limits = record(value), mediaTypes = limits?.mediaTypes
  const positive = (name: string) => Number.isSafeInteger(limits?.[name]) && (limits?.[name] as number) > 0
  if (limits === undefined || !positive('maxImageBytes') || !positive('maxImagesPerMessage') || !positive('maxMessageImageBytes')
    || !positive('maxImagePixels') || !positive('maxImageDimension') || !Array.isArray(mediaTypes)
    || !mediaTypes.every(type => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(type)))) return undefined
  return { maxImageBytes: limits.maxImageBytes as number, maxImagesPerMessage: limits.maxImagesPerMessage as number,
    maxMessageImageBytes: limits.maxMessageImageBytes as number, maxImagePixels: limits.maxImagePixels as number,
    maxImageDimension: limits.maxImageDimension as number, mediaTypes: mediaTypes as ImageAttachmentLimits['mediaTypes'] }
}
async function readAnnotationSettings(rpc: ClientConnectionRpc, signal: AbortSignal): Promise<AnnotationSettings> {
  const response = await rpc.call('/api', 'codex-subscription/preferences/status', {}, signal) as RpcResult
  if (response?.ok !== true) throw new Error('Could not read Codex image-edit settings')
  const value = record(response.value), imageLimits = decodeImageAttachmentLimits(value?.imageLimits)
  if (typeof value?.imageEditing !== 'boolean' || typeof value.imageAnnotations !== 'boolean' || imageLimits === undefined) throw new Error('Codex image-edit settings are unavailable')
  return { imageEditing: value.imageEditing, imageAnnotations: value.imageAnnotations, imageLimits }
}
function editPrompt(t: CodexOriginalImageToolViewProps['t'], annotations: readonly CodexImageAnnotation[], width: number, height: number): string {
  const notes = annotations.map((annotation, index) => t('codexAnnotationNote', {
    number: index + 1, x: Number((annotation.x * 100).toFixed(2)), y: Number((annotation.y * 100).toFixed(2)),
    nx: annotation.x.toFixed(4), ny: annotation.y.toFixed(4),
    px: Number((annotation.x * Math.max(0, width - 1)).toFixed(2)), py: Number((annotation.y * Math.max(0, height - 1)).toFixed(2)),
    width, height, note: annotation.note,
  })).join('\n')
  return t('codexAnnotationPrompt', { notes })
}
export function CodexOriginalImageToolView(props: CodexOriginalImageToolViewProps) {
  const [url, setUrl] = useState<string>()
  const [outputUrl, setOutputUrl] = useState<string>()
  const [preview, setPreview] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotations, setAnnotations] = useState<CodexImageAnnotation[]>([])
  const [annotationPending, setAnnotationPending] = useState(false)
  const [annotationPrepared, setAnnotationPrepared] = useState(false)
  const [annotationError, setAnnotationError] = useState<string>()
  const inputSnapshot = props.useInput(state => state)
  const inputSnapshotRef = useRef(inputSnapshot)
  inputSnapshotRef.current = inputSnapshot
  const abort = useRef<AbortController>()
  const loading = useRef(false)
  const blobCache = useRef<Blob>()
  const urlCache = useRef<string>()
  const annotationAbort = useRef<AbortController>()
  useEffect(() => () => {
    abort.current?.abort()
    annotationAbort.current?.abort()
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
  const beginAnnotations = async () => {
    if (annotationPending) return
    setAnnotationPending(true); setAnnotationError(undefined)
    const controller = new AbortController(); annotationAbort.current = controller
    try {
      if (!props.isCodexRoute()) throw new Error(props.t('codexAnnotationRouteRequired'))
      if (!outputRef || !outputUrl) throw new Error(props.t('codexOriginalUnavailable'))
      const settings = await readAnnotationSettings(props.rpc, controller.signal)
      controller.signal.throwIfAborted()
      if (!settings.imageEditing || !settings.imageAnnotations) throw new Error(props.t('codexAnnotationFeatureDisabled'))
      const current = inputSnapshotRef.current
      if (current.phase !== 'plain' || current.imageIds.length > 0 || (current.occurrences?.length ?? 0) > 0) throw new Error(props.t('codexAnnotationComposerBusy'))
      setAnnotations([]); setAnnotationPrepared(false); setAnnotationMode(true)
    } catch (cause) {
      if (!controller.signal.aborted) setAnnotationError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!controller.signal.aborted) setAnnotationPending(false)
    }
  }
  const prepareAnnotatedEdit = async () => {
    if (annotationPending || !outputRef || !outputUrl || !props.conversation) return
    setAnnotationPending(true); setAnnotationError(undefined)
    const controller = new AbortController(); annotationAbort.current = controller
    let draftImages: ReturnType<NonNullable<CodexOriginalImageToolViewProps['conversation']>['createDraftImages']> | undefined
    let imageIds: Parameters<InputActions['addImages']>[0] = []
    let attached = false
    try {
      if (!props.isCodexRoute()) throw new Error(props.t('codexAnnotationRouteRequired'))
      const marks = normalizeCodexImageAnnotations(annotations)
      const current = inputSnapshotRef.current
      if (current.phase !== 'plain' || current.imageIds.length > 0 || (current.occurrences?.length ?? 0) > 0) throw new Error(props.t('codexAnnotationComposerBusy'))
      const draftRev = current.draftRev
      const settings = await readAnnotationSettings(props.rpc, controller.signal)
      controller.signal.throwIfAborted()
      if (!settings.imageEditing || !settings.imageAnnotations) throw new Error(props.t('codexAnnotationFeatureDisabled'))
      const limits = settings.imageLimits
      if (limits.maxImagesPerMessage < 2 || !limits.mediaTypes.includes(outputRef.mediaType) || !limits.mediaTypes.includes('image/png')) throw new Error(props.t('codexAnnotationLimits'))
      if (outputRef.width > limits.maxImageDimension || outputRef.height > limits.maxImageDimension || outputRef.width * outputRef.height > limits.maxImagePixels) throw new Error(props.t('codexAnnotationLimits'))
      const response = await fetch(outputUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(props.t('codexOriginalUnavailable'))
      const sourceBlob = await response.blob()
      controller.signal.throwIfAborted()
      if (sourceBlob.size <= 0 || sourceBlob.size > limits.maxImageBytes || sourceBlob.size > limits.maxMessageImageBytes
        || sourceBlob.type !== '' && sourceBlob.type !== outputRef.mediaType) throw new Error(props.t('codexAnnotationLimits'))
      const currentAfterRead = inputSnapshotRef.current
      if (!props.isCodexRoute() || currentAfterRead.draftRev !== draftRev || currentAfterRead.phase !== 'plain'
        || currentAfterRead.imageIds.length > 0 || (currentAfterRead.occurrences?.length ?? 0) > 0) throw new Error(props.t('codexAnnotationComposerBusy'))
      const sourceExtension = outputRef.mediaType === 'image/jpeg' ? 'jpg' : outputRef.mediaType.slice('image/'.length)
      const cleanSource = new File([sourceBlob], `codex-clean-source.${sourceExtension}`, { type: outputRef.mediaType })
      const referenceBudget = Math.min(limits.maxImageBytes, limits.maxMessageImageBytes - sourceBlob.size)
      const locationReference = await createCodexLocationReference(sourceBlob, marks, limits, referenceBudget, { expectedWidth: outputRef.width, expectedHeight: outputRef.height })
      controller.signal.throwIfAborted()
      const latest = inputSnapshotRef.current
      if (!props.isCodexRoute() || latest.draftRev !== draftRev || latest.phase !== 'plain'
        || latest.imageIds.length > 0 || (latest.occurrences?.length ?? 0) > 0) throw new Error(props.t('codexAnnotationComposerBusy'))
      const prompt = editPrompt(props.t, marks, outputRef.width, outputRef.height)
      draftImages = props.conversation.createDraftImages([cleanSource, locationReference])
      imageIds = draftImages.map(image => image.id)
      if (!props.inputActions.addImages(imageIds)) throw new Error(props.t('codexAnnotationComposerBusy'))
      attached = true
      props.inputActions.setDraft([latest.draft, prompt].filter(Boolean).join('\n\n'))
      setAnnotationPrepared(true); setAnnotationMode(false)
    } catch (cause) {
      if (attached) for (const id of imageIds) props.inputActions.removeImage(id)
      if (draftImages && props.conversation) props.conversation.releaseDraftImages(draftImages)
      if (!controller.signal.aborted) setAnnotationError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!controller.signal.aborted) setAnnotationPending(false)
    }
  }
  const placeAnnotation = (event: MouseEvent<HTMLButtonElement>) => {
    if (!annotationMode || annotations.length >= 20) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.detail === 0 ? 0.5 : Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = event.detail === 0 ? 0.5 : Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    setAnnotations(current => current.length >= 20 ? current : [...current, { x, y, note: '' }])
  }
  if (props.phase !== 'result') return <div className={css.codexOriginalImageCard} role="status">{props.t('codexOriginalPending')}</div>
  if (!ref) return <div className={css.codexOriginalImageCard}>
    {outputUrl && <img className={css.codexOriginalOutputPreview} src={outputUrl} alt={props.t('codexImageOutputAlt')} />}
    {props.block.isError ? message || props.t('codexOriginalUnavailable') : props.t('codexOriginalUnavailable')}
  </div>
  const composerReady = inputSnapshot.phase === 'plain' && inputSnapshot.imageIds.length === 0 && (inputSnapshot.occurrences?.length ?? 0) === 0
  const annotationReady = annotations.length > 0 && annotations.every(annotation => annotation.note.trim().length > 0)
  return <section className={css.codexOriginalImageCard} aria-label={props.t('codexOriginalTitle')}>
    {outputUrl && (annotationMode ? <button type="button" className={css.codexAnnotationCanvas} aria-label={props.t('codexAnnotationCanvasAria')} onClick={placeAnnotation}>
      <img src={outputUrl} alt="" />
      {annotations.map((annotation, index) => <span key={index} className={css.codexAnnotationMarker} style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }} aria-hidden="true">{index + 1}</span>)}
    </button> : <img className={css.codexOriginalOutputPreview} src={outputUrl} alt={props.t('codexImageOutputAlt')} />)}
    <div className={css.codexOriginalImageHeader}>
      <strong>{props.t('codexOriginalTitle')}</strong>
      <span>{props.t('codexOriginalDimensions', { width: ref.width, height: ref.height })}</span>
    </div>
    <div className={css.codexOriginalImageActions}>
      <button type="button" className={css.codexOriginalImageButton} disabled={pending} onClick={() => { void openOriginal(false) }}>
        {props.t(preview ? 'codexOriginalShown' : pending ? 'codexOriginalLoading' : 'codexOriginalView')}
      </button>
      <button type="button" className={css.codexOriginalImageButton} disabled={!outputUrl || annotationPending || annotationPrepared || !props.isCodexRoute()} onClick={() => {
        if (annotationMode) { setAnnotationMode(false); setAnnotations([]); setAnnotationError(undefined) }
        else void beginAnnotations()
      }}>{props.t(annotationMode ? 'codexAnnotationCancel' : annotationPending ? 'codexOriginalLoading' : 'codexAnnotationStart')}</button>
      {url ? <a className={css.codexOriginalImageButton} href={url} download={ref.name}>{props.t('codexOriginalDownload')}</a>
        : <button type="button" className={css.codexOriginalImageButton} disabled={pending} onClick={() => { void openOriginal(true) }}>
          {props.t(pending ? 'codexOriginalLoading' : 'codexOriginalDownload')}
        </button>}
    </div>
    {annotationMode && <>
      <p className={css.codexAnnotationHint}>{props.t('codexAnnotationHint')}</p>
      {annotations.length > 0 && <ol className={css.codexAnnotationNotes}>
        {annotations.map((annotation, index) => <li key={index}>
          <label>
            <span>{props.t('codexAnnotationNoteLabel', { number: index + 1, x: Math.round(annotation.x * 100), y: Math.round(annotation.y * 100) })}</span>
            <textarea rows={2} maxLength={500} value={annotation.note} placeholder={props.t('codexAnnotationNotePlaceholder')}
              onChange={event => setAnnotations(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item))} />
          </label>
        </li>)}
      </ol>}
      <div className={css.codexOriginalImageActions}>
        <button type="button" className={css.codexOriginalImageButton} disabled={annotations.length === 0 || annotationPending} onClick={() => setAnnotations(current => current.slice(0, -1))}>{props.t('codexAnnotationUndo')}</button>
        <button type="button" className={css.codexOriginalImageButton} disabled={annotations.length === 0 || annotationPending} onClick={() => setAnnotations([])}>{props.t('codexAnnotationClear')}</button>
        <button type="button" className={css.codexOriginalImageButton} disabled={!annotationReady || annotationPending || !composerReady || !props.conversation || !props.isCodexRoute()} onClick={() => { void prepareAnnotatedEdit() }}>{props.t(annotationPending ? 'codexOriginalLoading' : 'codexAnnotationUse')}</button>
      </div>
      <p className={css.codexAnnotationHint}>{props.t('codexAnnotationQuotaHint')}</p>
      {!composerReady && <p className={css.error} role="status">{props.t('codexAnnotationComposerBusy')}</p>}
      {!props.conversation && <p className={css.error} role="status">{props.t('codexAnnotationUnavailable')}</p>}
      {!props.isCodexRoute() && <p className={css.error} role="status">{props.t('codexAnnotationRouteRequired')}</p>}
    </>}
    {!annotationMode && !props.isCodexRoute() && <p className={css.codexAnnotationHint}>{props.t('codexAnnotationRouteRequired')}</p>}
    {annotationPrepared && <p className={css.codexAnnotationSuccess} role="status">{props.t('codexAnnotationPrepared')}</p>}
    {annotationError && <p className={css.error} role="alert">{annotationError}</p>}
    {preview && url && <img className={css.codexOriginalImagePreview} src={url} alt={props.t('codexOriginalAlt')} />}
    {error && <p className={css.error} role="alert">{error}</p>}
  </section>
}
