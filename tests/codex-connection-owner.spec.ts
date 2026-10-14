import { readFileSync } from 'node:fs'
import { describe,it,expect,vi } from 'vitest'
import { createConnectionModeOwner,connectionModeSchema,type ConnectionMode } from '../src/codex/connection-mode.ts'
import { createCompactionModeOwner } from '../src/codex/cloud-compaction.ts'
const source=readFileSync(new URL('../src/codex/index.js',import.meta.url),'utf8'),region=(name:string)=>source.split(`//#region src/${name}.js\n`)[1]!.split('//#endregion')[0]!
const start=source.indexOf('\tconst preferences = {',source.indexOf('function apply(ctx,')),preferencesSource=source.slice(start,source.indexOf('\n\tconst authModels =',start))
const backend=new Function('ctx','connectionOwner','compactionOwner','connection',`${['image-models','image-features','capability-settings','settings-contract','preference-fields','subscription-rpc'].map(region).join('\n')}
const settings={get:()=>({searchMode:'disabled',searchProvider:'dsh',speedMode:'standard'}),update:()=>{throw Error('Unexpected legacy write')}};
const speedModeOwner=undefined,outputVerbosityOwner=undefined,contextLengthOwner=undefined;
const imageFeaturesOwner={current:()=>({imageGeneration:true,imageEditing:true}),writable:false};
const modelCatalog={status:()=>({}),metadata:()=>({})},provider={getModels:()=>[]},contextPreferences={status:()=>({}),current:()=>({})};
${preferencesSource}
return createSubscriptionRpcHandler({preferences});`)
function fixture(live=false){const entry={options:{config:{claudeExecutable:'keep',codexSpeedMode:'fast'} as Record<string,unknown>}},edit=vi.fn(async(_entry:any,change:any)=>{entry.options.config=change(entry.options.config)}),ctx={fiber:{entry},get:()=>({edit}),settings:{writable:false}},owner=createConnectionModeOwner(ctx as never,live?{get:()=>entry.options.config.codexConnectionMode as ConnectionMode??'sse'}:undefined),cloud=createCompactionModeOwner(ctx as never),connection={retireIdle:vi.fn()}
return {entry,edit,owner,cloud,connection,handler:backend(ctx,owner,cloud,connection)}}
const signal=()=>new AbortController().signal
describe('Mounted WebSocket preference RPC and native persistence',()=>{
 it.each([false,true])('starts with SSE and saves primitive/live configuration=%s without connecting',async live=>{
  const f=fixture(live);expect((connectionModeSchema.meta as any).volatile).toBe(true)
  expect(await f.handler('preferences/status',{},signal())).toMatchObject({ok:true,value:{connectionMode:'sse',connectionWritable:true}});expect(f.edit).not.toHaveBeenCalled()
  expect(await f.handler('preferences/update',{connectionMode:'websocket'},signal())).toMatchObject({ok:true,value:{connectionMode:'websocket'}})
  expect(f.entry.options.config).toMatchObject({claudeExecutable:'keep',codexSpeedMode:'fast',codexConnectionMode:'websocket'});expect(f.connection.retireIdle).not.toHaveBeenCalled()
  expect(await f.handler('preferences/update',{connectionMode:'sse'},signal())).toMatchObject({ok:true,value:{connectionMode:'sse'}});expect(f.connection.retireIdle).toHaveBeenCalledOnce()
 })
 it('rejects both exclusion directions without changing the other setting',async()=>{
  const f=fixture();await f.cloud.save('cloud')
  expect(await f.handler('preferences/update',{connectionMode:'websocket'},signal())).toMatchObject({ok:false,error:{code:'connection-mode-conflict'}})
  expect(f.owner.current()).toBe('sse');await f.cloud.save('dsh');await f.owner.save('websocket')
  expect(await f.handler('preferences/update',{compactionMode:'cloud'},signal())).toMatchObject({ok:false,error:{code:'connection-mode-conflict'}});expect(f.cloud.current()).toBe('dsh')
 })
 it('rejects unsupported/combined/aborted writes and read-only settings',async()=>{
  const f=fixture();for(const payload of [{connectionMode:'auto'},{connectionMode:'websocket-cached'},{connectionMode:'websocket',compactionMode:'cloud'}])expect((await f.handler('preferences/update',payload,signal())).ok).toBe(false)
  const c=new AbortController();c.abort();await expect(f.handler('preferences/update',{connectionMode:'websocket'},c.signal)).rejects.toThrow();expect(f.edit).not.toHaveBeenCalled()
  const readonly=createConnectionModeOwner({get:()=>undefined} as never),handler=backend({settings:{writable:false}},readonly,f.cloud,f.connection)
  expect(await handler('preferences/update',{connectionMode:'websocket'},signal())).toMatchObject({ok:false,error:{code:'read-only'}})
 })
})
