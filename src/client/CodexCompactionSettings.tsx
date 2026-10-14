/** Experimental wire compression preference; no request is sent when saving. */
import type { CompactionMode } from '../codex/cloud-compaction.ts'
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx'
import { CodexSelectSetting, type CodexSelectView } from './CodexSelectSetting.tsx'
const choices=['dsh','cloud'] as const
export async function requestCodexCompaction(rpc:CodexVerbosityProps['rpc'],value?:CompactionMode,signal?:AbortSignal){
  if(value!==undefined&&!choices.includes(value))throw new Error('Invalid Codex compaction mode')
  const response=await rpc.call('/api',value===undefined?'codex-subscription/preferences/status':'codex-subscription/preferences/update',value===undefined?{}:{compactionMode:value},signal)
  if(!response.ok)throw new Error(response.error.message)
  const result=response.value as {compactionMode?:unknown;compactionWritable?:unknown}
  if(!result||!choices.includes(result.compactionMode as CompactionMode)||typeof result.compactionWritable!=='boolean')throw new Error('Invalid Codex compaction preference response')
  if(value!==undefined&&result.compactionMode!==value)throw new Error('DSH did not accept the Codex compaction preference')
  return {value:result.compactionMode as CompactionMode,writable:result.compactionWritable}
}
const load=async(rpc:CodexVerbosityProps['rpc'],value?:string,signal?:AbortSignal):Promise<CodexSelectView>=>requestCodexCompaction(rpc,value as CompactionMode|undefined,signal)
export function CodexCompactionSettings(props:CodexVerbosityProps){return <CodexSelectSetting {...props} choices={choices} labels={['codexCompactionDsh','codexCompactionCloud']} title="codexCompaction" hint="codexCompactionHint" savedLabel="codexCompactionSaved" load={load}/>}
