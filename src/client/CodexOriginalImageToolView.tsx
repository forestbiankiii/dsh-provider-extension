/** Codex durable result card with an explicit, non-submitting image studio. */
import { useEffect, useRef, useState } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import type { ConversationController, InputActions, InputState, MessageImageLoader } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { createCodexLocationReference, normalizeCodexImageAnnotations, type CodexImageAnnotation } from './codex-image-annotations.ts'
import { fitEraseMask } from './image-studio-images.ts'
import { assertEmptyImageDraft, commitImageDraft, imageEditSettings, validateEditFiles } from './codex-image-edit.ts'
import { CodexImageViewer, type ImageEditRequest } from './CodexImageViewer.tsx'
import { CodexSketchBoard } from './CodexSketchBoard.tsx'
import { downloadBlob } from './image-studio-model.ts'
import type { ProviderPanelKey } from './locales.ts'
import css from './ProviderPanel.module.css'
const CHUNK_BYTES = 4 * 1024 * 1024
const ORIGINAL_IMAGE_LIMIT = 48 * 1024 * 1024
export interface CodexOriginalImageRef {
  readonly assetId: string; readonly mediaType: 'image/png'; readonly bytes: number; readonly width: number; readonly height: number; readonly name: string; readonly sha256: string
}
export interface CodexToolCallViewOwnerProps {
  readonly callId: string; readonly toolName: string; readonly phase: 'preparing' | 'start' | 'result'
  readonly block: { readonly meta?: unknown; readonly call?: { readonly name: string; readonly argsRaw: string } | null; readonly isError?: boolean; readonly content?: readonly unknown[] }
  readonly loadImage: MessageImageLoader
}
export interface CodexOriginalImageToolViewProps extends CodexToolCallViewOwnerProps {
  readonly sessionId: SessionId; readonly rpc: ClientConnectionRpc; readonly t: Translate<ProviderPanelKey>
  readonly conversation: Pick<ConversationController, 'createDraftImages' | 'releaseDraftImages'> | undefined
  readonly inputActions: InputActions; readonly useInput: SnapshotSelectorHook<InputState>; readonly isCodexRoute: () => boolean
}
interface RpcResult { readonly ok?: boolean; readonly value?: unknown; readonly error?: { readonly message?: unknown } }
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
export function decodeCodexOriginalImageRef(value: unknown): CodexOriginalImageRef | undefined {
  const meta=record(value),original=record(meta?.original)
  if(meta?.kind!=='codex-subscription-image'||meta.schemaVersion!==1||!original
    ||typeof original.assetId!=='string'||!/^img_[0-9a-f]{32}$/u.test(original.assetId)
    ||original.mediaType!=='image/png'||!Number.isSafeInteger(original.bytes)||(original.bytes as number)<=0||(original.bytes as number)>ORIGINAL_IMAGE_LIMIT
    ||!Number.isSafeInteger(original.width)||(original.width as number)<=0||!Number.isSafeInteger(original.height)||(original.height as number)<=0
    ||typeof original.name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(original.name)
    ||typeof original.sha256!=='string'||!/^[0-9a-f]{64}$/u.test(original.sha256))return undefined
  return {assetId:original.assetId,mediaType:'image/png',bytes:original.bytes as number,width:original.width as number,height:original.height as number,name:original.name,sha256:original.sha256}
}
function sameRef(value:unknown,expected:CodexOriginalImageRef){const a=record(value);return a?.assetId===expected.assetId&&a.mediaType===expected.mediaType&&a.bytes===expected.bytes&&a.width===expected.width&&a.height===expected.height&&a.name===expected.name&&a.sha256===expected.sha256}
export async function readCodexOriginalImage(rpc:ClientConnectionRpc,sessionId:SessionId,ref:CodexOriginalImageRef,signal:AbortSignal):Promise<Blob>{
  const data=new Uint8Array(ref.bytes)
  for(let offset=0;offset<ref.bytes;){
    signal.throwIfAborted()
    const response=await rpc.call('/api','codex-subscription/image/original/chunk',{sessionId,assetId:ref.assetId,offset},signal) as RpcResult
    if(response?.ok!==true){const message=response?.error?.message;throw new Error(typeof message==='string'&&message.length?message:'Could not read the original image')}
    const chunk=record(response.value)
    if(!chunk||!sameRef(chunk.ref,ref)||chunk.offset!==offset||typeof chunk.encoded!=='string'||typeof chunk.done!=='boolean')throw new Error('Invalid original image chunk')
    const expectedBytes=Math.min(CHUNK_BYTES,ref.bytes-offset)
    if(chunk.encoded.length>Math.ceil(expectedBytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(chunk.encoded))throw new Error('Invalid original image data')
    let binary:string;try{binary=atob(chunk.encoded)}catch{throw new Error('Invalid original image data')}
    if(binary.length!==expectedBytes||chunk.done!==(offset+expectedBytes===ref.bytes))throw new Error('Incomplete original image data')
    for(let i=0;i<binary.length;i++)data[offset+i]=binary.charCodeAt(i)
    offset+=binary.length
  }
  signal.throwIfAborted();return new Blob([data.buffer as ArrayBuffer],{type:'image/png'})
}
function outputImage(block:CodexOriginalImageToolViewProps['block']):ImageAttachmentRef|undefined{
  for(const raw of block.content??[]){const content=record(raw),image=record(content?.attachment)
    if(content?.type==='image'&&typeof image?.attachmentId==='string'&&image.attachmentId.length>0&&['image/png','image/jpeg','image/webp','image/gif'].includes(String(image.mediaType))
      &&Number.isSafeInteger(image.bytes)&&(image.bytes as number)>0&&(image.bytes as number)<=ORIGINAL_IMAGE_LIMIT&&Number.isSafeInteger(image.width)&&(image.width as number)>0&&Number.isSafeInteger(image.height)&&(image.height as number)>0)return image as unknown as ImageAttachmentRef
  }return undefined
}
function editPrompt(t:CodexOriginalImageToolViewProps['t'],marks:readonly CodexImageAnnotation[],width:number,height:number){
  const notes=marks.map((m,i)=>t('codexAnnotationNote',{number:i+1,x:Number((m.x*100).toFixed(2)),y:Number((m.y*100).toFixed(2)),nx:m.x.toFixed(4),ny:m.y.toFixed(4),px:Number((m.x*(width-1)).toFixed(2)),py:Number((m.y*(height-1)).toFixed(2)),width,height,note:m.note})).join('\n')
  return t('codexAnnotationPrompt',{notes})
}
export function CodexOriginalImageToolView(props:CodexOriginalImageToolViewProps){
  const [outputUrl,setOutputUrl]=useState<string>(),[originalUrl,setOriginalUrl]=useState<string>(),[viewer,setViewer]=useState(false),[sketch,setSketch]=useState(false)
  const [initialMark,setInitialMark]=useState(false),[annotations,setAnnotations]=useState<CodexImageAnnotation[]>([]),[pending,setPending]=useState(false),[error,setError]=useState(''),[prepared,setPrepared]=useState(false)
  const [features,setFeatures]=useState({editing:false,annotations:false,sketch:false})
  useEffect(()=>{
    if(!viewer&&!sketch)return
    const c=new AbortController()
    void imageEditSettings(props.rpc,c.signal).then(s=>{if(!c.signal.aborted)setFeatures({editing:s.imageEditing,annotations:s.imageAnnotations,sketch:s.imageSketch})}).catch(()=>{if(!c.signal.aborted)setFeatures({editing:false,annotations:false,sketch:false})})
    return()=>c.abort()
  },[viewer,sketch,props.rpc])
  const current=props.useInput(s=>s),currentRef=useRef(current);currentRef.current=current
  const blobCache=useRef<Blob>(),urlCache=useRef<string>(),operation=useRef<AbortController>()
  const outputRef=outputImage(props.block),ref=props.phase==='result'&&!props.block.isError?decodeCodexOriginalImageRef(props.block.meta):undefined
  useEffect(()=>{let live=true;setOutputUrl(undefined);if(outputRef)void props.loadImage(outputRef).then(u=>{if(live)setOutputUrl(u)}).catch(e=>{if(live)setError(String(e))});return()=>{live=false}},[props.loadImage,outputRef?.attachmentId])
  useEffect(()=>{
    blobCache.current=undefined;urlCache.current=undefined;setOriginalUrl(undefined);setViewer(false);setSketch(false);setAnnotations([]);setPending(false);setPrepared(false);setError('')
    return()=>{operation.current?.abort();if(urlCache.current)URL.revokeObjectURL(urlCache.current)}
  },[props.sessionId,props.callId])
  const original=async(download:boolean)=>{
    if(!ref||pending)return;setPending(true);setError('');const c=new AbortController();operation.current=c
    try{const blob=blobCache.current??await readCodexOriginalImage(props.rpc,props.sessionId,ref,c.signal);c.signal.throwIfAborted();blobCache.current=blob
      if(download)downloadBlob(blob,ref.name)
      else {if(!urlCache.current)urlCache.current=URL.createObjectURL(blob);setOriginalUrl(urlCache.current);setInitialMark(false);setViewer(true)}
    }catch(e){if(!c.signal.aborted){setError(e instanceof Error?e.message:String(e));throw e}}
    finally{if(!c.signal.aborted)setPending(false)}
  }
  const stageEdit=async(request:ImageEditRequest)=>{
    if(pending||!props.conversation)throw new Error(props.t('codexAnnotationUnavailable'))
    setPending(true);setError('');const c=new AbortController();operation.current=c
    try{
      const start=assertEmptyImageDraft(props,currentRef.current),rev=start.draftRev
      const settings=await imageEditSettings(props.rpc,c.signal);c.signal.throwIfAborted()
      if(!settings.imageEditing||(request.annotations&&!settings.imageAnnotations)||(request.source&&!settings.imageSketch))throw new Error(props.t('codexAnnotationFeatureDisabled'))
      let source=request.source
      const cleanUrl=outputUrl??originalUrl,cleanRef=outputUrl?outputRef:ref
      if(!source){if(!cleanUrl||!cleanRef)throw new Error(props.t('codexOriginalUnavailable'));const r=await fetch(cleanUrl,{signal:c.signal});if(!r.ok)throw new Error(props.t('codexOriginalUnavailable'));source=new File([await r.blob()],'codex-clean-source.png',{type:cleanRef.mediaType})}
      const w=request.width??cleanRef?.width??1,h=request.height??cleanRef?.height??1,files=[source]
      for(const extra of request.extra??[])files.push(extra.name==='codex-erase-mask.png'?await fitEraseMask(extra,w,h):extra)
      let prompt=request.prompt??props.t('studioSketchPrompt')
      if(request.annotations){const marks=normalizeCodexImageAnnotations(request.annotations);const budget=settings.limits.maxMessageImageBytes-source.size
        files.push(await createCodexLocationReference(source,marks,settings.limits,Math.min(budget,settings.limits.maxImageBytes),{expectedWidth:w,expectedHeight:h}));prompt=editPrompt(props.t,marks,w,h)}
      await validateEditFiles(files,settings.limits);c.signal.throwIfAborted()
      const latest=assertEmptyImageDraft(props,currentRef.current);if(latest.draftRev!==rev)throw new Error(props.t('codexAnnotationComposerBusy'))
      commitImageDraft(props,latest,files,prompt);setPrepared(true)
    }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:String(e));throw e}
    finally{if(!c.signal.aborted)setPending(false)}
  }
  const mark=async()=>{
    const c=new AbortController();operation.current=c
    try{const settings=await imageEditSettings(props.rpc,c.signal);c.signal.throwIfAborted();if(!settings.imageEditing||!settings.imageAnnotations)throw new Error(props.t('codexAnnotationFeatureDisabled'));assertEmptyImageDraft(props,currentRef.current);setFeatures({editing:settings.imageEditing,annotations:settings.imageAnnotations,sketch:settings.imageSketch});setInitialMark(true);setViewer(true);setError('')}catch(e){if(!c.signal.aborted)setError(String(e))}
  }
  const openSketch=async()=>{
    const c=new AbortController();operation.current=c
    try{const settings=await imageEditSettings(props.rpc,c.signal);c.signal.throwIfAborted();if(!settings.imageSketch)throw new Error(props.t('codexAnnotationFeatureDisabled'));setFeatures({editing:settings.imageEditing,annotations:settings.imageAnnotations,sketch:settings.imageSketch});setViewer(false);setSketch(true)}catch(e){if(!c.signal.aborted)setError(String(e))}
  }
  if(props.phase!=='result')return <div className={css.codexOriginalImageCard} role="status">{props.t('codexOriginalPending')}</div>
  const viewerSrc=originalUrl??outputUrl,viewerRef=originalUrl?ref:outputRef
  const message=(props.block.content??[]).map(record).filter(v=>v?.type==='text').map(v=>v?.text).join('\n')
  return <section className={css.codexOriginalImageCard} aria-label={props.t('codexOriginalTitle')}>
    {outputUrl&&<button type="button" className={css.codexThumbnail} aria-label={props.t('studioOpen')} onClick={()=>{setOriginalUrl(undefined);setInitialMark(false);setViewer(true)}}><img className={css.codexOriginalOutputPreview} src={outputUrl} alt={props.t('codexImageOutputAlt')} draggable={false}/></button>}
    {ref?<><div className={css.codexOriginalImageHeader}><strong>{props.t('codexOriginalTitle')}</strong><span>{props.t('codexOriginalDimensions',{width:ref.width,height:ref.height})}</span></div>
      <div className={css.codexOriginalImageActions}>
        <button type="button" className={css.codexOriginalImageButton} disabled={pending} onClick={()=>{void original(false).catch(()=>{})}}>{props.t(pending?'codexOriginalLoading':'codexOriginalView')}</button>
        <button type="button" className={css.codexOriginalImageButton} disabled={!outputUrl||pending||!props.isCodexRoute()} onClick={()=>void mark()}>{props.t('codexAnnotationStart')}</button>
        <button type="button" className={css.codexOriginalImageButton} disabled={pending} onClick={()=>{void original(true).catch(()=>{})}}>{props.t('codexOriginalDownload')}</button>
        <button type="button" className={css.codexOriginalImageButton} onClick={()=>void openSketch()}>{props.t('studioSketch')}</button>
      </div></>:<p>{props.block.isError?message||props.t('codexOriginalUnavailable'):props.t('codexOriginalUnavailable')}</p>}
    {prepared&&<p role="status">{props.t('codexAnnotationPrepared')}</p>}{error&&<p className={css.error} role="alert">{error}</p>}
    {viewer&&viewerSrc&&viewerRef&&<CodexImageViewer src={viewerSrc} width={viewerRef.width} height={viewerRef.height} name={ref?.name??'codex-generated.png'} t={props.t} initialMark={initialMark} annotations={annotations} onAnnotations={setAnnotations} onClose={()=>setViewer(false)} onDownload={()=>original(true)} onStage={stageEdit} canEdit={features.editing&&props.isCodexRoute()} canAnnotate={features.annotations} canSketch={features.sketch} onSketch={()=>void openSketch()}/>}
    {sketch&&<CodexSketchBoard t={props.t} sessionKey={props.sessionId} onClose={()=>setSketch(false)} onAttach={(source,width,height)=>stageEdit({source,width,height,prompt:props.t('studioSketchPrompt')})} {...viewerSrc?{src:viewerSrc}:{}}/>}
  </section>
}
