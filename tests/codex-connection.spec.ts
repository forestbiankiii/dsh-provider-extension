import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { afterEach,describe,it,expect,vi } from 'vitest'
import { createCodexConnection,createConnectionModeOwner } from '../src/codex/connection-mode.ts'
import { createCompactionModeOwner } from '../src/codex/cloud-compaction.ts'
const controllers:any[]=[]
afterEach(async()=>{for(const controller of controllers.splice(0))await controller.dispose();vi.restoreAllMocks()})
class FakeSocket extends EventEmitter {
  readyState=1;url:string;options:any
  constructor(url:string,options:any){super();this.url=url;this.options=options}
  terminate(){if(this.readyState===3)return;this.readyState=3;this.emit('close')}
  close(){this.terminate()}
  send(..._args:any[]){}
}
function fixture(initial='sse'){
  let mode=initial,cloud='dsh',proxy:string|undefined
  const controls={closeOpenAICodexWebSocketSessions:vi.fn(),resetOpenAICodexWebSocketDebugStats:vi.fn()},loadControls=vi.fn(async()=>controls),resolveProxy=vi.fn(async()=>proxy),created:FakeSocket[]=[]
  class OwnedSocket extends FakeSocket {constructor(url:string,options:any){super(url,options);created.push(this)}}
  const controller=createCodexConnection({mode:()=>mode as any,cloudMode:()=>cloud,resolveProxy,accountForToken:v=>v,WebSocket:OwnedSocket,loadControls});controllers.push(controller)
  return {controller,controls,loadControls,resolveProxy,created,setMode(value:string){mode=value},setCloud(value:string){cloud=value},setProxy(value:string|undefined){proxy=value}}
}
const options=(id='session-a')=>({provider:'openai-codex',model:'model-a',sessionId:id,messages:[{role:'user',content:[{type:'text',text:'task'}]}]})
const consume=async(stream:AsyncIterable<any>)=>{const results=[];for await(const value of stream)results.push(value);return results}
describe('Scoped native Codex WebSocket connection reuse',()=>{
  it('defaults to SSE without loading controls, resolving proxy or changing global constructors',async()=>{
    const f=fixture(),original=(globalThis as any).WebSocket
    const adapter=f.controller.wrapAdapter({async *stream(value:any){const prepared=await f.controller.prepare({...value,apiKey:'account-a'});yield prepared}})
    const value=(await consume(adapter.stream(options())))[0]
    expect(value.transport).toBe('sse');expect(value.sessionId).toBe('session-a');expect(f.loadControls).not.toHaveBeenCalled();expect(f.resolveProxy).not.toHaveBeenCalled();expect((globalThis as any).WebSocket).toBe(original)
  })
  it('preserves model/effort/hooks, hashes session/account/proxy identity and refuses native SSE fallback',async()=>{
    const f=fixture('websocket'),captured:any[]=[];f.setProxy('http://localhost:9000')
    const hook=()=>{},adapter=f.controller.wrapAdapter({async *stream(value:any){const prepared=await f.controller.prepare({...value,apiKey:'account-a',reasoningEffort:'high',onPayload:hook});captured.push(prepared);const socket=new (globalThis as any).WebSocket('wss://chatgpt.com/backend-api/codex/responses',{headers:{authorization:'secret'}});yield {type:'finish',reason:{kind:'stop'}};expect(socket.options.agent).toBeTruthy()}})
    await consume(adapter.stream(options()));await consume(adapter.stream(options()))
    expect(captured[0].sessionId).toMatch(/^dsh-ws-[a-f0-9]{56}$/);expect(captured[0].sessionId).toBe(captured[1].sessionId)
    expect(captured[0]).toMatchObject({provider:'openai-codex',model:'model-a',reasoningEffort:'high',transport:'websocket',onPayload:hook})
    expect(captured[0].transport).not.toBe('websocket-cached');expect(captured[0]).not.toHaveProperty('previous_response_id')
    await expect(captured[0].fetch('https://chatgpt.com/backend-api/codex/responses',{})).rejects.toThrow('fallback is disabled')
    expect(f.created[0].options.headers).toEqual({authorization:'secret'})
    const next=fixture('websocket');const other=next.controller.wrapAdapter({async *stream(value:any){yield await next.controller.prepare({...value,apiKey:'account-a'})}});const changed=(await consume(other.stream(options())))[0]
    expect(changed.sessionId).not.toBe(captured[0].sessionId)
  })
  it('keeps the constructor leased while a consumer pauses and cleans up orphan sockets',async()=>{
    const f=fixture('websocket'),original=(globalThis as any).WebSocket
    const adapter=f.controller.wrapAdapter({async *stream(value:any){await f.controller.prepare({...value,apiKey:'account-a'});new (globalThis as any).WebSocket('wss://chatgpt.com/backend-api/codex/responses',{});yield {type:'text-delta'};yield {type:'finish',reason:{kind:'stop'}}}})
    const iterator=adapter.stream(options())[Symbol.asyncIterator]();await iterator.next()
    expect((globalThis as any).WebSocket).not.toBe(original)
    await f.controller.dispose();expect(f.created[0].readyState).toBe(3);expect((globalThis as any).WebSocket).toBe(original)
    expect(()=>f.created[0].emit('error',new Error('late pipe error'))).not.toThrow()
    await iterator.return?.()
    for(const call of f.controls.closeOpenAICodexWebSocketSessions.mock.calls)expect(call[0]).toMatch(/^dsh-ws-/)
  })
  it('delegates outside contexts including derived constructors, and isolates simultaneous owners',async()=>{
    const original=(globalThis as any).WebSocket
    class Outside {static OPEN=1;args:any[];constructor(...args:any[]){this.args=args}}
    ;(globalThis as any).WebSocket=Outside
    const a=fixture('websocket'),b=fixture('websocket')
    const factory=(f:any)=>f.controller.wrapAdapter({async *stream(value:any){await f.controller.prepare({...value,apiKey:'account-a'});new (globalThis as any).WebSocket('wss://chatgpt.com/backend-api/codex/responses',{});yield {type:'text-delta'};yield {type:'finish',reason:{kind:'stop'}}}})
    const ai=factory(a).stream(options('a'))[Symbol.asyncIterator](),bi=factory(b).stream(options('b'))[Symbol.asyncIterator]()
    try{await Promise.all([ai.next(),bi.next()]);expect(a.created).toHaveLength(1);expect(b.created).toHaveLength(1)
      const outside=new (globalThis as any).WebSocket('wss://elsewhere.example','proto');expect(outside).toBeInstanceOf(Outside);expect(outside.args).toEqual(['wss://elsewhere.example','proto'])
      class Derived extends (globalThis as any).WebSocket{};expect(new Derived('wss://elsewhere.example')).toBeInstanceOf(Derived)
      await a.controller.dispose();expect((globalThis as any).WebSocket).not.toBe(Outside);await b.controller.dispose();expect((globalThis as any).WebSocket).toBe(Outside)
    }finally{await ai.return?.();await bi.return?.();(globalThis as any).WebSocket=original}
  })
  it('does not borrow a parent WebSocket context for nested auxiliary calls',async()=>{
    const f=fixture('websocket');let adapter:any
    adapter=f.controller.wrapAdapter({async *stream(value:any){if(value.purpose){yield await f.controller.prepare({...value,apiKey:'account-a'});return}await f.controller.prepare({...value,apiKey:'account-a'});const nested=await consume(adapter.stream({...options(),purpose:'compaction'}));expect(nested[0].transport).toBe('sse');expect(nested[0].sessionId).toBe('session-a');yield {type:'finish',reason:{kind:'stop'}}}})
    await consume(adapter.stream(options()))
  })
  it('retains accepted streams on an SSE switch, then retires their sockets after completion',async()=>{
    const f=fixture('websocket'),adapter=f.controller.wrapAdapter({async *stream(value:any){await f.controller.prepare({...value,apiKey:'account-a'});new (globalThis as any).WebSocket('wss://chatgpt.com/backend-api/codex/responses',{});yield {type:'text-delta'};yield {type:'finish',reason:{kind:'stop'}}}})
    const iterator=adapter.stream(options())[Symbol.asyncIterator]();await iterator.next();f.setMode('sse');f.controller.retireIdle();expect(f.created[0].readyState).toBe(1)
    await iterator.next();await iterator.next();expect(f.created[0].readyState).toBe(3)
  })
  it('fences preparation after disposal and rejects contradictory cloud configuration at dispatch',async()=>{
    const f=fixture('websocket');f.setCloud('cloud');const adapter=f.controller.wrapAdapter({async *stream(){yield {type:'finish',reason:{kind:'stop'}}}})
    await expect(consume(adapter.stream(options()))).rejects.toThrow('cannot be enabled together')
    f.setCloud('dsh');await f.controller.dispose();await expect(consume(adapter.stream(options()))).rejects.toThrow('disposed')
  })
  it('force-releases a reused socket after a cancelled finish, not only newly created sockets',async()=>{
    const f=fixture('websocket');let socket:any,cancelled=false
    const adapter=f.controller.wrapAdapter({async *stream(value:any){await f.controller.prepare({...value,apiKey:'account-a'});socket??=new (globalThis as any).WebSocket('wss://chatgpt.com/backend-api/codex/responses',{});socket.send('request');yield {type:'finish',reason:{kind:cancelled?'aborted':'stop'}}}})
    await consume(adapter.stream(options()));expect(socket.readyState).toBe(1);cancelled=true;await consume(adapter.stream(options()));expect(socket.readyState).toBe(3);expect(f.created).toHaveLength(1)
  })
  it('does not fence another live session when one owner is disposed',async()=>{
    const f=fixture('websocket'),adapter=f.controller.wrapAdapter({async *stream(value:any){await f.controller.prepare({...value,apiKey:'account-a'});yield {type:'text-delta'};new (globalThis as any).WebSocket('wss://chatgpt.com/backend-api/codex/responses',{});yield {type:'finish',reason:{kind:'stop'}}}})
    const a=adapter.stream(options('a'))[Symbol.asyncIterator](),b=adapter.stream(options('b'))[Symbol.asyncIterator]()
    await Promise.all([a.next(),b.next()]);await f.controller.close('a');await b.next();await b.next()
    expect(f.created).toHaveLength(1);expect(f.created[0].readyState).toBe(1);await a.return?.()
  })
  it('cancels proxy preparation on unload without allowing a late socket to be created',async()=>{
    const f=fixture('websocket');let resume!:()=>void
    f.resolveProxy.mockImplementationOnce(()=>new Promise(resolve=>{resume=()=>resolve(undefined)}))
    const adapter=f.controller.wrapAdapter({async *stream(value:any){await f.controller.prepare({...value,apiKey:'account-a'});new (globalThis as any).WebSocket('wss://chatgpt.com/backend-api/codex/responses',{});yield {type:'finish',reason:{kind:'stop'}}}})
    const running=consume(adapter.stream(options()));const failed=expect(running).rejects.toThrow()
    await Promise.resolve();await Promise.resolve();const disposing=f.controller.dispose();resume();await failed;await disposing
    expect(f.created).toHaveLength(0)
  })
  it('wires the mounted controller to the existing proxy route resolver and extracts its URL',async()=>{
    const source=readFileSync(new URL('../src/codex/index.js',import.meta.url),'utf8'),start=source.indexOf('\tconst connection = createCodexConnection('),end=source.indexOf('\n\tctx.effect',start)
    const resolver=vi.fn(async()=>({url:'http://localhost:9000',source:'environment'}))
    const mounted=new Function('createCodexConnection','connectionOwner','compactionOwner','tokenAccount','WebSocket','resolveCodexProxy',source.slice(start,end)+'\nreturn connection')((dependencies:any)=>dependencies,{current:()=> 'websocket'},{current:()=> 'dsh'},()=> 'account',FakeSocket,resolver)
    expect(await mounted.resolveProxy()).toBe('http://localhost:9000');expect(resolver).toHaveBeenCalledWith({target:new URL('https://chatgpt.com/')})
  })
  it('checks cross-field exclusions inside the native editor callback, including concurrent saves',async()=>{
    const entry={options:{config:{} as Record<string,unknown>}},writes:any[]=[],editor={async edit(_entry:any,change:any){await Promise.resolve();entry.options.config=change(entry.options.config);writes.push(entry.options.config)}}
    const ctx={fiber:{entry},get:()=>editor},connection=createConnectionModeOwner(ctx as never),cloud=createCompactionModeOwner(ctx as never)
    expect(connection.current()).toBe('sse');expect(cloud.current()).toBe('dsh')
    const results=await Promise.allSettled([connection.save('websocket'),cloud.save('cloud')]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(entry.options.config.codexConnectionMode==='websocket'&&entry.options.config.codexCompactionMode==='cloud').toBe(false)
    expect(writes).toHaveLength(1)
  })
})
