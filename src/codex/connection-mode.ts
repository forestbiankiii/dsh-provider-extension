/** Opt-in connection reuse on the native Codex protocol; full context, no SSE fallback. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash,randomUUID } from 'node:crypto'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { Context } from '@deepseek-ai/cordis'
import { createEnumOwner,volatileEnum,type EnumConfig } from './enum-preference.ts'
export type ConnectionMode='sse'|'websocket'
export type ConnectionModeConfig=EnumConfig<ConnectionMode>
export const connectionModeSchema=volatileEnum(['sse','websocket'] as const,'sse','Codex connection reuse only; WebSocket is opt-in and incompatible with cloud compaction. Subscription requests use normal quota.')
export const createConnectionModeOwner=(ctx:Context,config?:ConnectionModeConfig)=>createEnumOwner(ctx,config,'codexConnectionMode',['sse','websocket'] as const,'sse','Codex connection mode',(previous,value)=>{if(value==='websocket'&&previous.codexCompactionMode==='cloud')throw Object.assign(new Error('WebSocket and cloud compaction cannot be enabled together; choose DSH compaction first'),{code:'connection-mode-conflict'})})
interface Frame {rawId:string;controller:AbortController;signal:AbortSignal;key?:string;proxy?:string|undefined;ready:boolean;finished:boolean;iterator?:AsyncIterator<any>;cleanup?:Promise<void>;sockets:Set<any>;release:()=>void;factory:(url:any,options:any)=>any}
const socketScope=new AsyncLocalStorage<Frame|undefined>()
let muxLeases=0,mux:any,original:any
function leaseConstructor(){
  if(muxLeases===0){
    const fallback=(globalThis as any).WebSocket;original=fallback
    mux=function(this:any,...args:any[]){if(!new.target)throw new TypeError('WebSocket constructor requires new');const frame=socketScope.getStore();if(frame){let target:URL|undefined;try{target=new URL(String(args[0]))}catch{}if(target?.protocol==='wss:'&&target.hostname==='chatgpt.com'&&target.port===''&&target.pathname==='/backend-api/codex/responses')return frame.factory(args[0],args[1]);}if(typeof fallback!=='function')throw new Error('WebSocket is unavailable outside the Codex request');return Reflect.construct(fallback,args,new.target===mux?fallback:new.target)}
    if(typeof fallback==='function'){Object.setPrototypeOf(mux,fallback);mux.prototype=fallback.prototype}
    ;(globalThis as any).WebSocket=mux
  }
  muxLeases++;let released=false
  return ()=>{if(released)return;released=true;if(--muxLeases===0){if((globalThis as any).WebSocket===mux){if(original===undefined)delete (globalThis as any).WebSocket;else (globalThis as any).WebSocket=original}mux=undefined;original=undefined}}
}
export interface SocketControls {closeOpenAICodexWebSocketSessions(id:string):void;resetOpenAICodexWebSocketDebugStats(id:string):void}
export function createCodexConnection({mode,cloudMode,resolveProxy,accountForToken,WebSocket,loadControls}:{mode:()=>ConnectionMode;cloudMode:()=>string;resolveProxy:()=>Promise<string|undefined>;accountForToken:(token:string|undefined)=>string|undefined;WebSocket:any;loadControls:()=>Promise<SocketControls>}){
  const namespace=randomUUID(),frames=new Set<Frame>(),keys=new Map<string,Set<string>>(),sockets=new Map<any,{raw:string;key:string}>()
  let controls:SocketControls|undefined,loading:Promise<SocketControls>|undefined,disposed=false,generation=0
  const native=()=>loading??=(loadControls().then(value=>{if(typeof value.closeOpenAICodexWebSocketSessions!=='function'||typeof value.resetOpenAICodexWebSocketDebugStats!=='function')throw new Error('The Codex SDK lacks WebSocket session cleanup');controls=value;return value}).catch(error=>{loading=undefined;throw error}))
  const terminate=(socket:any)=>{try{socket.terminate()}catch{try{socket.close()}catch{}}}
  const closeOwner=(owner:string)=>{for(const key of keys.get(owner)??[]){controls?.closeOpenAICodexWebSocketSessions(key);controls?.resetOpenAICodexWebSocketDebugStats(key)}keys.delete(owner);for(const [socket,record]of sockets)if(record.raw===owner)terminate(socket)}
  const cleanup=(frame:Frame,abort:boolean)=>frame.cleanup??=(async()=>{
    if(abort)frame.controller.abort()
    try{await socketScope.run(frame,()=>frame.iterator?.return?.())}finally{if(abort)for(const socket of frame.sockets)terminate(socket);frames.delete(frame);if(mode()!=='websocket'&&![...frames].some(other=>other.rawId===frame.rawId))closeOwner(frame.rawId);frame.release()}
  })()
  const wrapStream=(factory:(options:any)=>AsyncIterable<any>,options:any)=>(async function*(){
    if(mode()!=='websocket'||options.provider!=='openai-codex'||options.purpose!==undefined||!options.sessionId){const iterator=socketScope.run(undefined,()=>factory(options)[Symbol.asyncIterator]());try{while(true){const item=await socketScope.run(undefined,()=>iterator.next());if(item.done)break;yield item.value}}finally{await socketScope.run(undefined,()=>iterator.return?.())}return}
    if(disposed)throw new Error('Codex WebSocket owner is disposed')
    if(cloudMode()==='cloud')throw new Error('WebSocket and cloud compaction cannot be enabled together')
    const controller=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal,revision=generation
    const frame:Frame={rawId:String(options.sessionId),controller,signal,ready:false,finished:false,sockets:new Set(),release:leaseConstructor(),factory:()=>{throw new Error('WebSocket request is not prepared')}}
    frame.factory=(url,init)=>{
      if(disposed||revision!==generation||frame.cleanup||frame.finished||!frame.ready||signal.aborted)throw new Error('Codex WebSocket request was cancelled or settings changed')
      const socket=new WebSocket(url,{...init,...(frame.proxy?{agent:new HttpsProxyAgent(frame.proxy)}:{}),maxPayload:16*1024*1024})
      frame.sockets.add(socket);sockets.set(socket,{raw:frame.rawId,key:frame.key!})
      const send=socket.send
      if(typeof send==='function')socket.send=function(...args:any[]){const current=socketScope.getStore();if(current&&current.key===frame.key){if(current.signal.aborted||current.cleanup||current.finished)throw new Error('Codex WebSocket request was cancelled');current.sockets.add(socket)}return send.apply(socket,args)}
      const failed=()=>{if(socket.readyState!==3)terminate(socket)},closed=()=>{frame.sockets.delete(socket);sockets.delete(socket);socket.removeListener('close',closed)}
      socket.on('error',failed);socket.on('close',closed)
      return socket
    }
    frames.add(frame)
    try{
      signal.throwIfAborted()
      frame.iterator=socketScope.run(frame,()=>factory({...options,signal})[Symbol.asyncIterator]())
      while(true){const item=await socketScope.run(frame,()=>frame.iterator!.next());if(item.done)break;if(item.value.type==='finish')frame.finished=!signal.aborted&&['stop','tool-calls'].includes(item.value.reason?.kind);yield item.value}
    }finally{await cleanup(frame,!frame.finished)}
  })()
  return {
    wrapAdapter<T extends object>(adapter:T):T{return new Proxy(adapter,{get(target,key){
      if(key==='stream')return(options:any)=>wrapStream(o=>(target as any).stream(o),options)
      if(key==='prepareCall')return async(...args:any[])=>{const call=await (target as any).prepareCall(...args);return {...call,stream:(options:any)=>wrapStream(o=>call.stream(o),options)}}
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
    }})},
    async prepare(options:any={}){
      const frame=socketScope.getStore();if(!frame)return {...options,transport:'sse'}
      const revision=generation,signal=options.signal;signal?.throwIfAborted()
      const account=accountForToken(options.apiKey);if(typeof account!=='string'||!account||account.length>512)throw new Error('Codex WebSocket requires an authenticated account identity')
      const [runtime,proxy]=await Promise.all([native(),resolveProxy()]);signal?.throwIfAborted()
      if(disposed||revision!==generation)throw new Error('Codex WebSocket settings changed during preparation')
      frame.proxy=proxy;frame.key='dsh-ws-'+createHash('sha256').update(JSON.stringify([namespace,frame.rawId,account,proxy??null])).digest('hex').slice(0,56);frame.ready=true
      let owned=keys.get(frame.rawId);if(!owned){owned=new Set();keys.set(frame.rawId,owned)}owned.add(frame.key)
      for(const old of owned)if(old!==frame.key&&![...frames].some(other=>other!==frame&&other.key===old)){runtime.closeOpenAICodexWebSocketSessions(old);runtime.resetOpenAICodexWebSocketDebugStats(old);for(const [socket,record]of sockets)if(record.key===old)terminate(socket);owned.delete(old)}
      runtime.resetOpenAICodexWebSocketDebugStats(frame.key)
      return {...options,sessionId:frame.key,transport:'websocket',env:{},fetch:async()=>{throw new Error('Codex WebSocket failed; automatic SSE fallback is disabled. Select SSE explicitly to continue.')}}
    },
    async close(rawId?:string){
      if(rawId===undefined)generation++
      const selected=[...frames].filter(frame=>rawId===undefined||frame.rawId===rawId)
      for(const frame of selected)frame.controller.abort()
      await Promise.allSettled(selected.map(frame=>cleanup(frame,true)))
      const owners=rawId===undefined?[...keys.keys()]:[rawId]
      for(const owner of owners)closeOwner(owner)
      if(rawId===undefined)for(const socket of sockets.keys())terminate(socket)
    },
    retireIdle(){for(const owner of keys.keys())if(![...frames].some(frame=>frame.rawId===owner))closeOwner(owner)},
    async dispose(){disposed=true;await this.close()},
  }
}
