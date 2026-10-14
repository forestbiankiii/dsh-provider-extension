/** Opt-in inline cloud compaction; durable checkpoints live in native replay metadata. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { createEnumOwner, volatileEnum, type EnumConfig } from './enum-preference.ts'
export type CompactionMode='dsh'|'cloud'
export type CompactionModeConfig=EnumConfig<CompactionMode>
export const compactionModeSchema=volatileEnum(['dsh','cloud'] as const,'dsh','Experimental inline Codex cloud compaction; DSH history/manual compaction remain available. Subscription usage may apply.')
export const createCompactionModeOwner=(ctx:Context,config?:CompactionModeConfig)=>createEnumOwner(ctx,config,'codexCompactionMode',['dsh','cloud'] as const,'dsh','Codex cloud compaction')
export const CLOUD_CHECKPOINT='dpeCodexCloudCompactionV1'
const MAX_BYTES=2*1024*1024,MAX_AGE_MS=7*24*60*60*1000
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v))
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const record=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const historyHash=(messages:any[])=>hash(messages.map(message=>{if(!message.source?.replayState?.response)return message;const response={...message.source.replayState.response};delete response[CLOUD_CHECKPOINT];return {...message,source:{...message.source,replayState:{...message.source.replayState,response}}}}))
const nativeHash=(replay:any)=>{const response={...replay.response};delete response[CLOUD_CHECKPOINT];return hash({...replay,response})}
const envelopeHash=(options:any)=>hash({system:options.system??null,tools:options.tools??null,toolHistory:options.toolHistory??null,reasoningEffort:options.reasoningEffort??null,temperature:options.temperature??null,maxTokens:options.maxTokens??null})
const validItems=(items:any)=>Array.isArray(items)&&items.length>0&&items.length<=256&&items.every(record)&&items[0].type==='compaction'&&typeof items[0].encrypted_content==='string'&&items[0].encrypted_content.length>0&&Buffer.byteLength(JSON.stringify(items))<=MAX_BYTES
interface CloudState {account:string;scope:string;envelope:string;original:any[];excludedSystem:boolean;blocks:any[];candidate?:any;anchorIndex?:number;inputLength?:number;inputHash?:string;wireEnvelope?:string;captured?:any[]|undefined;completed:boolean;authorized:boolean;oversized:boolean}
export function createCloudCompaction({enabled,accountScope,accountForToken,now=Date.now}:{enabled:()=>boolean;accountScope:(options:any)=>Promise<string|undefined>;accountForToken:(token:string|undefined)=>string|undefined;now?:()=>number}){
  const storage=new AsyncLocalStorage<CloudState>()
  const wrapStream=(factory:(options:any)=>AsyncIterable<any>,options:any)=>(async function*(){
    if(!enabled()||options.provider!=='openai-codex'||options.purpose!==undefined||!options.sessionId){yield* factory(options);return}
    options.signal?.throwIfAborted();const account=await accountScope(options);options.signal?.throwIfAborted()
    if(!account)throw new Error('Cloud compaction requires an authenticated Codex account identity')
    const state:CloudState={account,scope:hash([account,options.model,options.sessionId]),envelope:envelopeHash(options),original:options.messages,excludedSystem:options.system===undefined&&options.messages[0]?.role==='system',blocks:[],completed:false,authorized:false,oversized:false}
    const messages=options.messages
    for(let i=messages.length-1;i>=0;i--){
      const candidate=messages[i].source?.replayState?.response?.[CLOUD_CHECKPOINT]
      if(candidate===undefined)continue
      if(record(candidate)&&candidate.version===1&&candidate.scope===state.scope&&candidate.envelope===state.envelope&&Number.isFinite(candidate.createdAt)&&candidate.createdAt<=now()&&now()-candidate.createdAt<=MAX_AGE_MS&&candidate.prefix===historyHash(messages.slice(0,i))&&candidate.content===hash(messages[i].content)&&messages[i].source.kind==='model'&&messages[i].source.provider===options.provider&&messages[i].source.model===options.model&&candidate.native===nativeHash(messages[i].source.replayState)&&validItems(candidate.items)&&candidate.digest===hash(candidate.items)){
        state.candidate=candidate;state.anchorIndex=i
      }
      break
    }
    const iterator=storage.run(state,()=>factory(options)[Symbol.asyncIterator]())
    try{while(true){
      const result=await storage.run(state,()=>iterator.next());if(result.done)break
      let event=result.value
      if(event.type==='block-end')state.blocks[event.index]=clone(event.block)
      if(event.type==='finish'&&['stop','tool-calls'].includes(event.reason?.kind)&&!options.signal?.aborted&&state.authorized&&state.completed&&!state.oversized&&validItems(state.captured)&&record(event.replayState?.response)){
        const items=clone(state.captured),checkpoint={version:1,createdAt:now(),scope:state.scope,envelope:state.envelope,inputLength:state.inputLength,inputHash:state.inputHash,wireEnvelope:state.wireEnvelope,prefix:historyHash(state.original),content:hash(state.blocks.filter(Boolean)),native:nativeHash(event.replayState),items,digest:hash(items)}
        event={...event,replayState:{...event.replayState,response:{...event.replayState.response,[CLOUD_CHECKPOINT]:checkpoint}}}
      }
      yield event
    }}finally{await storage.run(state,()=>iterator.return?.())}
  })()
  return {
    wrapAdapter<T extends object>(adapter:T):T{return new Proxy(adapter,{get(target,key){
      if(key==='stream')return (options:any)=>wrapStream(o=>(target as any).stream(o),options)
      if(key==='prepareCall')return async(...args:any[])=>{const call=await (target as any).prepareCall(...args);return {...call,stream:(options:any)=>wrapStream(o=>call.stream(o),options)}}
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
    }})},
    async preparePayload(payload:any,contextWindow:number,token:string|undefined,context:any,model:any,convertPrefix:(context:any,count:number,model:any)=>Promise<any[]>){
      const state=storage.getStore();if(!state)return payload
      if(accountForToken(token)!==state.account)throw new Error('Codex account changed while preparing cloud compaction; retry explicitly')
      state.authorized=true
      if(!Number.isFinite(contextWindow)||contextWindow<2000)throw new Error('Cloud compaction requires a valid model context window')
      if(!Array.isArray(payload.input))throw new Error('Cloud compaction requires native input-array chaining')
      const {input,...wire}=payload;state.inputLength=input.length;state.inputHash=hash(input);state.wireEnvelope=hash([wire,contextWindow,model.api])
      let nextInput=input
      const checkpoint=state.candidate
      if(checkpoint){
        if(checkpoint.wireEnvelope!==state.wireEnvelope)throw new Error('Cloud compaction request envelope changed; choose DSH mode to rebuild context')
        const excluded=state.excludedSystem?1:0,leading=context.messages[0]?.role==='system'?1:0
        if(context.messages.length!==state.original.length-excluded+leading)throw new Error('Cloud compaction cannot verify the native message boundary')
        const prefix=await convertPrefix(context,state.anchorIndex!+1-excluded+leading,model)
        if(!Number.isSafeInteger(checkpoint.inputLength)||checkpoint.inputLength<0||checkpoint.inputLength>prefix.length||prefix.length>input.length||hash(prefix)!==hash(input.slice(0,prefix.length))||checkpoint.inputHash!==hash(input.slice(0,checkpoint.inputLength)))throw new Error('Cloud compaction native replay boundary changed; choose DSH mode to rebuild context')
        nextInput=[...clone(checkpoint.items),...input.slice(prefix.length)]
      }
      return {...payload,input:nextInput,context_management:[{type:'compaction',compact_threshold:Math.min(100000,Math.floor(contextWindow/2))}]}
    },
    observeResponse(response:Response,input:any){
      const state=storage.getStore();if(!state)return response
      const target=new URL(typeof input==='string'||input instanceof URL?input:input.url)
      if(target.protocol!=='https:'||target.hostname!=='chatgpt.com'||target.pathname!=='/backend-api/codex/responses')return response
      state.completed=false;state.captured=undefined;state.oversized=false
      if(!response.ok||!response.body)return response
      let buffer='',dataLines:string[]=[],frameBytes=0,slotBytes=0;const slots=new Map<number,any>(),decoder=new TextDecoder()
      const observe=(text:string)=>{
        if(!text||text==='[DONE]')return
        let event:any;try{event=JSON.parse(text)}catch{return}
        if(event.type==='response.output_item.done'){
          const index=event.output_index
          if(!Number.isSafeInteger(index)||index<0||index>255||!record(event.item)){state.oversized=true;return}
          const old=slots.get(index);slotBytes-=old?Buffer.byteLength(JSON.stringify(old)):0
          slots.set(index,clone(event.item));slotBytes+=Buffer.byteLength(JSON.stringify(event.item))
          if(slotBytes>MAX_BYTES){slots.clear();state.oversized=true}
        }
        if(['response.completed','response.done'].includes(event.type)&&event.response?.status==='completed'){
          let output:any[]
          if(Array.isArray(event.response.output))output=event.response.output
          else {
            const indexes=[...slots.keys()].sort((a,b)=>a-b)
            if(indexes.some((value,i)=>value!==i)){state.oversized=true;return}
            output=indexes.map(index=>slots.get(index))
          }
          let index=output.length-1;while(index>=0&&output[index]?.type!=='compaction')index--
          state.captured=index<0?undefined:clone(output.slice(index))
          state.completed=!state.oversized&&validItems(state.captured)
        }
      }
      const consumeLine=(line:string)=>{
        if(!line){if(dataLines.length)observe(dataLines.join('\n'));dataLines=[];frameBytes=0;return}
        if(line.startsWith('data:')){const data=line.slice(5).replace(/^ /,'');frameBytes+=Buffer.byteLength(data);if(frameBytes>MAX_BYTES){state.oversized=true;state.captured=undefined;dataLines=[]}else dataLines.push(data)}
      }
      const body=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(bytes,controller){
        controller.enqueue(bytes);if(state.oversized)return
        buffer+=decoder.decode(bytes,{stream:true})
        let index:number;while((index=buffer.indexOf('\n'))>=0){consumeLine(buffer.slice(0,index).replace(/\r$/,''));buffer=buffer.slice(index+1);if(state.oversized)break}
        if(Buffer.byteLength(buffer)>MAX_BYTES){buffer='';state.oversized=true;state.captured=undefined}
      },flush(){if(state.oversized)return;buffer+=decoder.decode();if(buffer)consumeLine(buffer.replace(/\r$/,''));consumeLine('')}}))
      return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers})
    },
    requestOptions(options:any){return storage.getStore()?{...options,transport:'sse',fetch:async(input:any,init:any)=>this.observeResponse(await (options.fetch??globalThis.fetch)(input,init),input)}:options}
  }
}
