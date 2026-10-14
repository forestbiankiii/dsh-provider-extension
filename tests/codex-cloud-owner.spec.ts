import { readFileSync } from 'node:fs'
import { describe,it,expect,vi } from 'vitest'
import { createCompactionModeOwner,compactionModeSchema,type CompactionMode } from '../src/codex/cloud-compaction.ts'
const source=readFileSync(new URL('../src/codex/index.js',import.meta.url),'utf8')
const region=(name:string)=>source.split(`//#region src/${name}.js\n`)[1]!.split('//#endregion')[0]!
const start=source.indexOf('\tconst preferences = {',source.indexOf('function apply(ctx,')),preferencesSource=source.slice(start,source.indexOf('\n\tconst authModels =',start))
const backend=new Function('ctx','compactionOwner',`${['image-models','image-features','capability-settings','settings-contract','preference-fields','subscription-rpc'].map(region).join('\n')}
const settings={get:()=>({searchMode:'disabled',searchProvider:'dsh',speedMode:'standard'}),update:()=>{throw Error('Unexpected legacy settings write')}};
const speedModeOwner=undefined,outputVerbosityOwner=undefined,contextLengthOwner=undefined,connectionOwner=undefined;
const imageFeaturesOwner={current:()=>({imageGeneration:true,imageEditing:true}),writable:false};
const modelCatalog={status:()=>({}),metadata:()=>({})},provider={getModels:()=>[]},contextPreferences={status:()=>({}),current:()=>({}),update:()=>{throw Error('Unexpected context write')}};
${preferencesSource}
return createSubscriptionRpcHandler({preferences});`)
function fixture(live=false){const entry={options:{config:{codexSpeedMode:'fast',claudeExecutable:'keep'} as Record<string,unknown>}},edit=vi.fn(async(_entry:any,change:any)=>{entry.options.config=change(entry.options.config)}),ctx={fiber:{entry},get:(name:string)=>name==='configEditor'?{edit}:undefined,settings:{writable:false}}
const owner=createCompactionModeOwner(ctx as never,live?{get:()=>entry.options.config.codexCompactionMode as CompactionMode??'dsh'}:undefined)
return {entry,edit,owner,handler:backend(ctx,owner)}}
describe('User-only cloud compaction persistence and real RPC',()=>{
 it.each([false,true])('defaults to DSH and persists only the confirmed preference, live=%s',async live=>{
  const f=fixture(live),signal=new AbortController().signal
  expect((compactionModeSchema.meta as any).volatile).toBe(true)
  expect((await f.handler('preferences/status',{},signal)).value.compactionMode).toBe('dsh');expect(f.edit).not.toHaveBeenCalled()
  expect(await f.handler('preferences/update',{compactionMode:'cloud'},signal)).toMatchObject({ok:true,value:{compactionMode:'cloud',compactionWritable:true}})
  expect(createCompactionModeOwner({fiber:{entry:f.entry},get:()=>({edit:f.edit})} as never).current()).toBe('cloud')
  expect(f.entry.options.config).toMatchObject({codexSpeedMode:'fast',claudeExecutable:'keep',codexCompactionMode:'cloud'})
  expect(await f.handler('preferences/update',{compactionMode:'dsh'},signal)).toMatchObject({ok:true,value:{compactionMode:'dsh'}})
 })
 it('rejects invalid values and aborted saves before writing',async()=>{
  const f=fixture();expect((await f.handler('preferences/update',{compactionMode:'other'},new AbortController().signal)).ok).toBe(false)
  const c=new AbortController();c.abort();await expect(f.handler('preferences/update',{compactionMode:'cloud'},c.signal)).rejects.toThrow();expect(f.edit).not.toHaveBeenCalled()
 })
 it('does not authorize cloud compaction in a read-only deployment',async()=>{
  const owner=createCompactionModeOwner({get:()=>undefined} as never),handler=backend({settings:{writable:false}},owner)
  expect(await handler('preferences/update',{compactionMode:'cloud'},new AbortController().signal)).toMatchObject({ok:false,error:{code:'read-only'}})
 })
})
