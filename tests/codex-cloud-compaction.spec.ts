import { describe,it,expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createCloudCompaction,CLOUD_CHECKPOINT } from '../src/codex/cloud-compaction.ts'
const text=(value:string)=>[{type:'text',text:value}]
const encrypted={type:'compaction',id:'cmp-1',encrypted_content:'opaque-ciphertext'}
const answer={type:'message',id:'msg-1',role:'assistant',content:[{type:'output_text',text:'answer'}],status:'completed'}
const sse=(events:any[])=>events.map(event=>`data: ${JSON.stringify(event)}\r\n\r\n`).join('')+'data: [DONE]\r\n\r\n'
const completed=(items=[encrypted,answer],type='response.completed')=>sse([{type:'response.output_item.done',output_index:0,item:encrypted},{type,response:{status:'completed',output:items}}])
const wire=(messages:any[])=>messages.map(message=>({role:message.role,content:message.content}))
const base=(messages:any[]=[{role:'user',id:'u1',content:text('task')}])=>({provider:'openai-codex',model:'gpt-test',sessionId:'s1',messages,tools:[{name:'read',parameters:{}}]})
function fixture({enabled=true,body=completed(),finish='stop',responseOk=true}:{enabled?:boolean;body?:string;finish?:string;responseOk?:boolean}={}){
  let account='account-a',token='account-a',bodyText=body
  const calls:any[]=[],nativeFinish={type:'finish',reason:{kind:finish},replayState:{response:{kind:'pi-ai',version:2,api:'openai-codex-responses',provider:'openai-codex',model:'gpt-test',stopReason:'stop'},blocks:[{type:'text',signature:'native-signature'}]}}
  const bridge=createCloudCompaction({enabled:()=>enabled,accountScope:async()=>account,accountForToken:value=>value,now:()=>1000})
  const factory=async function*(options:any){
    const excluded=options.system===undefined&&options.messages[0]?.role==='system'
    const context={messages:excluded?options.messages.slice(1):options.messages,...(excluded?{systemPrompt:'rules'}:{})}
    const payload={model:options.model,instructions:context.systemPrompt??options.system??'rules',tools:options.tools,input:wire(context.messages),store:false,stream:true}
    const preferred=await bridge.preparePayload(payload,128000,token,context,{api:'openai-codex-responses'},async(ctx,count)=>wire(ctx.messages.slice(0,count)))
    calls.push({options,payload:preferred})
    const original=new Response(bodyText,{status:responseOk?200:400,headers:{'content-type':'text/event-stream'}})
    const response=bridge.observeResponse(original,'https://chatgpt.com/backend-api/codex/responses')
    expect(await response.text()).toBe(bodyText)
    yield {type:'block-end',index:0,block:{type:'text',text:'answer'}}
    yield nativeFinish
  }
  const adapter={stream:factory,prepareCall:async()=>({model:{id:'gpt-test'},stream:factory})},wrapped=bridge.wrapAdapter(adapter)
  const run=async(options:any,prepared=false)=>{const stream=prepared?(await wrapped.prepareCall()).stream(options):wrapped.stream(options);const events=[];for await(const event of stream)events.push(event);return events.at(-1)}
  return {bridge,calls,run,nativeFinish,setAccount(value:string){account=value;token=value},setToken(value:string){token=value},setBody(value:string){bodyText=value}}
}
const append=(options:any,event:any)=>({...options,messages:[...options.messages,{role:'assistant',id:'a1',content:text('answer'),source:{kind:'model',provider:'openai-codex',model:'gpt-test',replayState:event.replayState}},{role:'user',id:'u2',content:text('next')}]})
describe('Inline Codex cloud compaction',()=>{
  it('leaves ordinary/default and auxiliary requests byte-equivalent without cloud fields',async()=>{
    for(const options of [base(),{...base(),provider:'claude'},{...base(),purpose:'compaction'},{...base(),purpose:'session-title'}]){
      const f=fixture({enabled:false});await f.run(options);expect(f.calls[0].payload).not.toHaveProperty('context_management')
      expect(f.calls[0].options).toBe(options);expect(f.calls[0].payload.input).toEqual(wire(options.messages))
    }
    const active=fixture();await active.run({...base(),purpose:'compaction'});expect(active.calls[0].payload).not.toHaveProperty('context_management')
  })
  it('persists successful encrypted checkpoints in existing replay without mutating frozen history',async()=>{
    const f=fixture(),options=base();Object.freeze(options.messages[0]);Object.freeze(options.messages);Object.freeze(options)
    const finish=await f.run(options,true)
    expect(f.calls[0].payload.context_management).toEqual([{type:'compaction',compact_threshold:64000}])
    expect(finish.replayState.response[CLOUD_CHECKPOINT].items).toEqual([encrypted,answer])
    expect(finish.replayState.blocks).toEqual(f.nativeFinish.replayState.blocks)
    expect(f.nativeFinish.replayState.response).not.toHaveProperty(CLOUD_CHECKPOINT)
    expect(options.messages).toHaveLength(1)
  })
  it('reuses durable checkpoints after remount, prunes only wire input and retains current tail once',async()=>{
    const first=fixture(),options=base(),finish=await first.run(options),next=append(options,finish),second=fixture()
    await second.run(next)
    expect(second.calls[0].options.messages).toBe(next.messages)
    expect(second.calls[0].payload.input).toEqual([encrypted,answer,...wire(next.messages.slice(-1))])
    expect(next.messages).toHaveLength(3)
  })
  it('binds account/session/model/instructions/tools and native replay provenance',async()=>{
    const oldAssistant={role:'assistant',id:'old-a',content:text('old'),source:{kind:'model',provider:'openai-codex',model:'gpt-test',replayState:{response:{kind:'pi-ai',version:2},blocks:[{signature:'old-native-signature'}]}}}
    const first=fixture(),options=base([{role:'user',content:text('task')},oldAssistant]),finish=await first.run(options),next=append(options,finish)
    const changes=[{sessionId:'forked'},{model:'different'},{system:'new rules'},{tools:[{name:'write'}]},{messages:[next.messages[0],{...oldAssistant,source:{...oldAssistant.source,replayState:{...oldAssistant.source.replayState,blocks:[{signature:'changed'}]}}},...next.messages.slice(2)]}]
    for(const change of changes){const f=fixture();await f.run({...next,...change});expect(f.calls[0].payload.input[0].type).not.toBe('compaction')}
    const account=fixture();account.setAccount('account-b');await account.run(next);expect(account.calls[0].payload.input[0].type).not.toBe('compaction')
    const raced=fixture();raced.setToken('account-b');await expect(raced.run(options)).rejects.toThrow('account changed');expect(raced.calls).toHaveLength(0)
  })
  it('fails closed on changed native envelope/boundary instead of silently replaying the wrong window',async()=>{
    const f=fixture(),options=base(),finish=await f.run(options),next=append(options,finish)
    next.messages[1].source.replayState.response[CLOUD_CHECKPOINT].wireEnvelope='bad-envelope'
    await expect(f.run(next)).rejects.toThrow('envelope changed')
    next.messages[1].source.replayState.response[CLOUD_CHECKPOINT].wireEnvelope=finish.replayState.response[CLOUD_CHECKPOINT].wireEnvelope
  })
  it('does not checkpoint failed/aborted/incomplete/oversized streams',async()=>{
    for(const finish of ['error','aborted','max-tokens']){const f=fixture({finish});const result=await f.run(base());expect(result.replayState.response).not.toHaveProperty(CLOUD_CHECKPOINT)}
    const incomplete=fixture({body:sse([{type:'response.output_item.done',item:encrypted}])});expect((await incomplete.run(base())).replayState.response).not.toHaveProperty(CLOUD_CHECKPOINT)
    const oversized=fixture({body:completed([{...encrypted,encrypted_content:'中'.repeat(800000)},answer])});expect((await oversized.run(base())).replayState.response).not.toHaveProperty(CLOUD_CHECKPOINT)
  })
  it('reads multiline CRLF SSE and authoritative response.done output in server order',async()=>{
    const event=JSON.stringify({type:'response.done',response:{status:'completed',output:[encrypted,answer]}},null,2)
    const f=fixture({body:event.split('\n').map(line=>'data: '+line).join('\r\n')+'\r\n\r\n'})
    expect((await f.run(base())).replayState.response[CLOUD_CHECKPOINT].items).toEqual([encrypted,answer])
  })
  it('invalidates altered native replay on the checkpoint-owning assistant',async()=>{
    const first=fixture(),options=base(),finish=await first.run(options),next=append(options,finish)
    next.messages[1].source.replayState.blocks=[{type:'text',signature:'changed-native-signature'}]
    const f=fixture();await f.run(next);expect(f.calls[0].payload.input[0].type).not.toBe('compaction')
  })
  it('deduplicates reordered item completions by index without a terminal output array',async()=>{
    const f=fixture({body:sse([{type:'response.output_item.done',output_index:1,item:answer},{type:'response.output_item.done',output_index:0,item:encrypted},{type:'response.output_item.done',output_index:1,item:answer},{type:'response.completed',response:{status:'completed'}}])})
    expect((await f.run(base())).replayState.response[CLOUD_CHECKPOINT].items).toEqual([encrypted,answer])
  })
  it('uses the authoritative terminal array even when it has no compaction and refuses sparse fallback',async()=>{
    for(const events of [[{type:'response.output_item.done',output_index:0,item:encrypted},{type:'response.completed',response:{status:'completed',output:[answer]}}],[{type:'response.output_item.done',output_index:1,item:encrypted},{type:'response.completed',response:{status:'completed'}}]]){
      const f=fixture({body:sse(events)});expect((await f.run(base())).replayState.response).not.toHaveProperty(CLOUD_CHECKPOINT)
    }
  })
  it('removes only the native synthetic tool results from the verified prefix, retaining real tail results',async()=>{
    const source=readFileSync(new URL('../src/codex/index.js',import.meta.url),'utf8'),start=source.indexOf('async function cloudWirePrefix('),end=source.indexOf('\nimport { clientRequestSchema',start)
    const context={messages:[{role:'user',content:'task'},{role:'assistant',content:[{type:'toolCall',id:'call-1',name:'read'}]},{role:'toolResult',toolCallId:'call-1',content:'real result'}]}
    const transcript={normalizeContext:(value:any)=>value,getDeclaredTools:()=>[]},sampling={createGrammarToolInputProperties:()=>new Map()}
    const responses={convertResponsesMessages:(_model:any,prefix:any)=>{const result:any[]=[{role:'user',content:'task'},{type:'function_call',call_id:'call-1',name:'read'}];result.push({type:'function_call_output',call_id:'call-1',output:prefix.messages.length===2?'No result provided':'real result'});return result}}
    const helper=new Function('cloudWireHelpers',source.slice(start,end)+'\nreturn cloudWirePrefix')(Promise.resolve([transcript,responses,sampling]))
    const prefix=await helper(context,2,{compat:{}}),full=responses.convertResponsesMessages({},context)
    expect(prefix).toEqual(full.slice(0,2));expect(full.slice(prefix.length)).toEqual([{type:'function_call_output',call_id:'call-1',output:'real result'}])
  })
  it('forwards cancellation and preserves the native replay envelope without committing a checkpoint',async()=>{
    const f=fixture(),controller=new AbortController();controller.abort(new Error('cancelled'))
    await expect(f.run({...base(),signal:controller.signal})).rejects.toThrow('cancelled')
    expect(f.calls).toHaveLength(0)
  })
})
