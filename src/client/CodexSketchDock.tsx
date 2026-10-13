import { useEffect, useRef, useState } from 'react'
import type { CodexOriginalImageToolViewProps } from './CodexOriginalImageToolView.tsx'
import { CodexSketchBoard } from './CodexSketchBoard.tsx'
import { StudioIcon } from './image-studio-modal.tsx'
import { assertEmptyImageDraft, commitImageDraft, imageEditSettings, validateEditFiles } from './codex-image-edit.ts'
import css from './ProviderPanel.module.css'
export type CodexSketchDockProps = Pick<CodexOriginalImageToolViewProps,'rpc'|'sessionId'|'t'|'conversation'|'isCodexRoute'|'inputActions'|'useInput'>
export function CodexSketchDock(props:CodexSketchDockProps){
  const [open,setOpen]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const input=props.useInput(s=>s),latest=useRef(input);latest.current=input
  const controller=useRef<AbortController>()
  useEffect(()=>()=>controller.current?.abort(),[props.sessionId])
  const start=async()=>{setBusy(true);setError('');const c=new AbortController();controller.current=c
    try{const settings=await imageEditSettings(props.rpc,c.signal);c.signal.throwIfAborted();if(!settings.imageSketch)throw new Error(props.t('codexAnnotationFeatureDisabled'));setOpen(true)}catch(e){if(!c.signal.aborted)setError(String(e))}finally{if(!c.signal.aborted)setBusy(false)}}
  const attach=async(file:File)=>{
    const c=new AbortController();controller.current=c;const input=assertEmptyImageDraft(props,latest.current),rev=input.draftRev
    const settings=await imageEditSettings(props.rpc,c.signal);if(!settings.imageSketch||!settings.imageEditing)throw new Error(props.t('studioUnavailable'))
    await validateEditFiles([file],settings.limits);c.signal.throwIfAborted();const current=assertEmptyImageDraft(props,latest.current)
    if(current.draftRev!==rev)throw new Error(props.t('codexAnnotationComposerBusy'))
    commitImageDraft(props,current,[file],props.t('studioSketchPrompt'))
  }
  if(!props.isCodexRoute())return null
  return <div className={css.codexSketchEntry}><button type="button" className={css.codexSketchTrigger} title={error||props.t('studioSketch')} aria-label={props.t('studioSketch')} aria-haspopup="dialog" aria-expanded={open} disabled={busy} onClick={()=>void start()}><StudioIcon name="pen"/></button>{error&&<span className={css.codexSketchEntryError} role="alert">{error}</span>}{open&&<CodexSketchBoard t={props.t} sessionKey={props.sessionId} onClose={()=>setOpen(false)} onAttach={attach}/>}</div>
}
