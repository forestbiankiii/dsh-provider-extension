/** User-only connection preference. Saving never opens a socket. */
import type { ConnectionMode } from '../codex/connection-mode.ts'
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx'
import { CodexSelectSetting,type CodexSelectView } from './CodexSelectSetting.tsx'
const choices=['sse','websocket'] as const
export async function requestCodexConnection(rpc:CodexVerbosityProps['rpc'],value?:ConnectionMode,signal?:AbortSignal){
  if(value!==undefined&&!choices.includes(value))throw new Error('Invalid Codex connection mode')
  const response=await rpc.call('/api',value===undefined?'codex-subscription/preferences/status':'codex-subscription/preferences/update',value===undefined?{}:{connectionMode:value},signal)
  if(!response.ok)throw new Error(response.error.message)
  const result=response.value as {connectionMode?:unknown;connectionWritable?:unknown;compactionMode?:unknown}
  if(!result||!choices.includes(result.connectionMode as ConnectionMode)||typeof result.connectionWritable!=='boolean')throw new Error('Invalid Codex connection settings response')
  if(value!==undefined&&result.connectionMode!==value)throw new Error('DSH did not accept the Codex connection setting')
  return {value:result.connectionMode as ConnectionMode,writable:result.connectionWritable,...(result.compactionMode==='cloud'?{note:'codexConnectionCloudConflict' as const}:{})}
}
const load=async(rpc:CodexVerbosityProps['rpc'],value?:string,signal?:AbortSignal):Promise<CodexSelectView>=>requestCodexConnection(rpc,value as ConnectionMode|undefined,signal)
export function CodexConnectionSettings(props:CodexVerbosityProps){return <CodexSelectSetting {...props} choices={choices} labels={['codexConnectionSse','codexConnectionWebsocket']} title="codexConnection" hint="codexConnectionHint" savedLabel="codexConnectionSaved" load={load}/>}
