import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment'
import type { CodexOriginalImageToolViewProps } from './CodexOriginalImageToolView.tsx'
import { imageInputActions, imageInputState } from './codex-image-composer.ts'

function record(value: unknown): Record<string,unknown> | undefined { return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined }
export async function imageEditSettings(rpc: ClientConnectionRpc, signal: AbortSignal) {
  const response=await rpc.call('/api','codex-subscription/preferences/status',{},signal) as {ok?:boolean;value?:unknown}
  if(response?.ok!==true)throw new Error('Could not read Codex image settings')
  const value=record(response.value),limits=record(value?.imageLimits)
  if(!limits||!['maxImageBytes','maxImagesPerMessage','maxMessageImageBytes','maxImagePixels','maxImageDimension'].every(k=>Number.isSafeInteger(limits[k])&&(limits[k] as number)>0)
    ||!Array.isArray(limits.mediaTypes)||!limits.mediaTypes.every(v=>['image/png','image/jpeg','image/webp','image/gif'].includes(String(v))))throw new Error('Image attachment limits unavailable')
  return { imageEditing:value?.imageEditing===true,imageAnnotations:value?.imageAnnotations===true,imageSketch:value?.imageSketch===true,limits:limits as unknown as ImageAttachmentLimits }
}
export function assertEmptyImageDraft(props: Pick<CodexOriginalImageToolViewProps,'isCodexRoute'|'t'>, state: Parameters<typeof imageInputState>[0]) {
  const current=imageInputState(state)
  if(!props.isCodexRoute())throw new Error(props.t('codexAnnotationRouteRequired'))
  if(current.phase!=='plain'||current.imageIds.length||(current.occurrences?.length??0))throw new Error(props.t('codexAnnotationComposerBusy'))
  return current
}
/** Stage only. Never submit, bypass the edit switch or flatten existing reference chips. */
export function commitImageDraft(props: Pick<CodexOriginalImageToolViewProps,'conversation'|'inputActions'|'isCodexRoute'|'t'>, state: Parameters<typeof imageInputState>[0], files: File[], prompt: string) {
  const current=assertEmptyImageDraft(props,state),conversation=props.conversation
  if(!conversation)throw new Error(props.t('codexAnnotationUnavailable'))
  const actions=imageInputActions(props.inputActions),drafts=conversation.createDraftImages(files)
  let attached=false
  try {
    if(!actions.addImages(drafts.map(d=>d.id)))throw new Error(props.t('codexAnnotationComposerBusy'))
    attached=true;actions.setDraft([current.draft,prompt].filter(Boolean).join('\n\n'))
  } catch(e) {
    if(attached)for(const d of drafts)actions.removeImage(d.id)
    conversation.releaseDraftImages(drafts);throw e
  }
}
export async function validateEditFiles(files: File[], limits: ImageAttachmentLimits) {
  if(!files.length||files.length>limits.maxImagesPerMessage||files.reduce((sum,f)=>sum+f.size,0)>limits.maxMessageImageBytes)throw new Error('Image attachment limits exceeded')
  for(const file of files){
    if(!limits.mediaTypes.includes(file.type as ImageAttachmentLimits['mediaTypes'][number])||file.size<1||file.size>limits.maxImageBytes)throw new Error('Image attachment limits exceeded')
    const bitmap=await createImageBitmap(file)
    try { if(bitmap.width>limits.maxImageDimension||bitmap.height>limits.maxImageDimension||bitmap.width*bitmap.height>limits.maxImagePixels)throw new Error('Image dimensions exceed attachment limits') }
    finally {bitmap.close()}
  }
}
