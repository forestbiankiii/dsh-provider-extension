/** User-only DSH delegation opt-in; reading or saving never starts a task. */
import { useEffect, useRef, useState } from 'react'
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx'
import css from './ProviderSettings.module.css'
export interface CodexSubtasksView {enabled:boolean;writable:boolean;available:boolean;active:number;toolName:string}
export async function requestCodexSubtasks(rpc:CodexVerbosityProps['rpc'],enabled?:boolean,signal?:AbortSignal):Promise<CodexSubtasksView>{
  const result=await rpc.call('/api',`codex-subscription/subtask/${enabled===undefined?'status':'preference'}`,enabled===undefined?{}:{enabled},signal)
  if(!result.ok)throw new Error(result.error.message)
  const value=result.value as CodexSubtasksView
  if(!value||['enabled','writable','available'].some(key=>typeof value[key as keyof CodexSubtasksView]!=='boolean')||!Number.isSafeInteger(value.active)||value.active<0||value.toolName!=='codex_subtask')throw new Error('Invalid Codex subtask response')
  if(enabled!==undefined&&value.enabled!==enabled)throw new Error('DSH did not accept the Codex subtask setting')
  return value
}
export function CodexSubtasksSettings({rpc,t,subscribe}:CodexVerbosityProps){
  const[view,setView]=useState<CodexSubtasksView>(),[pending,setPending]=useState(false),[reading,setReading]=useState(true),[revision,setRevision]=useState(0),[error,setError]=useState(''),[saved,setSaved]=useState(false)
  const alive=useRef(true),saving=useRef(false)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>subscribe?.(()=>setRevision(v=>v+1)),[subscribe])
  useEffect(()=>{const c=new AbortController();setReading(true);void requestCodexSubtasks(rpc,undefined,c.signal).then(v=>{if(!c.signal.aborted){setView(v);setError('')}}).catch(e=>{if(!c.signal.aborted)setError(String(e))}).finally(()=>{if(!c.signal.aborted)setReading(false)});return()=>c.abort()},[rpc,revision])
  const save=async(enabled:boolean)=>{if(saving.current)return;saving.current=true;setPending(true);setError('');setSaved(false);try{const next=await requestCodexSubtasks(rpc,enabled);if(alive.current){setView(next);setSaved(true)}}catch(e){if(alive.current)setError(String(e))}finally{saving.current=false;if(alive.current)setPending(false)}}
  return <div className={`${css.fieldGroup} ${css.verbositySetting}`}>
    <h3>{t('codexSubtasks')}</h3><p className={css.note}>{t('codexSubtasksHint')}</p>
    <div className={css.imageFeatureRow}><div><span className={css.imageFeatureLabel}>{t('codexSubtasksEnabled')}</span><p className={css.note}>{t('codexSubtasksParameters')}</p></div><label className={css.switch}><input type="checkbox" role="switch" aria-label={t('codexSubtasksEnabled')} aria-checked={view?.enabled??false} checked={view?.enabled??false} disabled={pending||reading||!view?.writable||!view.enabled&&!view.available} onChange={e=>void save(e.target.checked)}/><span className={css.switchSlider}/></label></div>
    {view&&!view.available&&<p className={css.note}>{t('codexSubtasksUnavailable')}</p>}
    {view&&!view.writable&&<p className={css.note}>{t('codexVerbosityReadOnly')}</p>}
    {error&&<p className={css.error} role="alert">{error}</p>}
    {(reading||pending||saved)&&<p className={saved&&!reading&&!pending?css.saveSuccessMsg:css.note} role="status">{t(reading?'providerChecking':pending?'providerWorking':'codexSubtasksSaved')}</p>}
  </div>
}
