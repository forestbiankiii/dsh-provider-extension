import { afterEach,describe,it,expect,vi } from 'vitest'
import { createCodexSubtasks,SUBTASK_TOOL } from '../src/codex/subtasks.ts'
const controllers:any[]=[]
afterEach(async()=>{for(const c of controllers.splice(0))await c.dispose()})
function fixture(initial='disabled'){
  let mode=initial
  const unregistered=vi.fn(),scopedRegister=vi.fn(()=>unregistered),otherRegister=vi.fn(()=>vi.fn())
  const parent:any={id:'session-1',options:{provider:'openai-codex',model:'test-codex',reasoningEffort:'high'},session:{requestHeader:()=>({config:parent.options})},ctx:{get:()=>({register:scopedRegister}),effect:(fn:any)=>fn()}}
  const other:any={id:'session-2',options:{provider:'claude'},session:{requestHeader:()=>({config:{provider:'claude'}})},ctx:{get:()=>({register:otherRegister}),effect:(fn:any)=>fn()}}
  const childDispose=vi.fn(async()=>{}),childStart=vi.fn(async()=>({id:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:'answer'}]}),dispose:childDispose}))
  const backend={inheritsParentContext:false,capabilities:{agentOptions:true,depthLimit:true}}
  const jobs:any={start:vi.fn((spec:any)=>{jobs.hooks=spec.run();return 'subagent-1'})}
  const owner:any={current:()=>mode,writable:true,save:vi.fn(async(value:string)=>{mode=value})},listeners=new Map<string,any>()
  const ctx:any={tools:{register:vi.fn()},subagents:{getProvider:vi.fn(()=>backend),resolveMaxDepth:vi.fn(()=>3),start:childStart,registerProvider:vi.fn()},llm:{listModels:vi.fn(async()=>[{id:'test-codex'},{id:'other-model'}]),resolveCallConfig:vi.fn(async(value:any)=>value)},get:(name:string)=>name==='agents'?{list:()=>[parent,other]}:name==='jobs'?jobs:undefined,on:vi.fn((event:string,fn:any)=>{listeners.set(event,fn);return vi.fn()})}
  const controller=createCodexSubtasks(ctx,owner);controllers.push(controller)
  return {controller,ctx,owner,parent,other,childStart,childDispose,scopedRegister,otherRegister,unregistered,jobs,listeners,exec:{agent:parent,signal:new AbortController().signal}}
}
describe('DSH native Codex subtasks',()=>{
  it('starts no task while disabled and only registers an additive tool for Codex agents',async()=>{
    const f=fixture();f.controller.sync();expect(f.scopedRegister).not.toHaveBeenCalled();expect(f.childStart).not.toHaveBeenCalled()
    await f.controller.preference(true);expect(f.scopedRegister).toHaveBeenCalledOnce();expect(f.otherRegister).not.toHaveBeenCalled();expect(f.ctx.tools.register).not.toHaveBeenCalled();expect(f.ctx.subagents.registerProvider).not.toHaveBeenCalled()
    expect(f.controller.tool.name).toBe(SUBTASK_TOOL);expect(f.controller.tool.deferLoading).toBe(true)
    await f.controller.preference(false);expect(f.unregistered).toHaveBeenCalledOnce()
    await expect(f.controller.tool.execute({description:'Task',prompt:'Review'},f.exec)).rejects.toThrow('disabled')
  })
  it('uses DSH spawn and its depth policy with an exact model/effort and unchanged parent',async()=>{
    const f=fixture('enabled'),before=structuredClone(f.parent.options)
    expect(await f.controller.tool.execute({description:'Task',prompt:'Review only',model:'other-model',reasoning_effort:'low'},f.exec)).toEqual({kind:'foreground',text:'answer'})
    expect(f.childStart).toHaveBeenCalledWith('spawn',expect.objectContaining({parent:f.parent,maxDepth:3,agentOptions:{provider:'openai-codex',model:'other-model',reasoningEffort:'low'},prompt:[{type:'text',text:'Review only'}]}))
    expect(f.ctx.llm.resolveCallConfig).toHaveBeenCalledWith({provider:'openai-codex',model:'other-model',reasoningEffort:'low'},f.exec.signal)
    expect(f.parent.options).toEqual(before);expect(f.childDispose).toHaveBeenCalledOnce();expect(f.controller.status().active).toBe(0)
  })
  it('inherits effort on the same model but not across model changes',async()=>{
    const f=fixture('enabled');await f.controller.tool.execute({description:'Task',prompt:'Review'},f.exec)
    expect(f.ctx.llm.resolveCallConfig.mock.calls[0][0].reasoningEffort).toBe('high')
    await f.controller.tool.execute({description:'Task',prompt:'Review',model:'other-model'},f.exec)
    expect(f.ctx.llm.resolveCallConfig.mock.calls[1][0]).not.toHaveProperty('reasoningEffort')
  })
  it('rejects policy overrides, unknown models and unsupported efforts before child creation',async()=>{
    const f=fixture('enabled')
    for(const extra of [{permissionMode:'danger-full-access'},{env:{}},{provider:'claude'}])await expect(f.controller.tool.execute({description:'Task',prompt:'Review',...extra},f.exec)).rejects.toThrow()
    await expect(f.controller.tool.execute({description:'Task',prompt:'Review',model:'unknown'},f.exec)).rejects.toThrow('not advertised')
    f.ctx.llm.resolveCallConfig.mockRejectedValueOnce(new Error('unsupported effort'))
    await expect(f.controller.tool.execute({description:'Task',prompt:'Review',reasoning_effort:'fake'},f.exec)).rejects.toThrow('unsupported effort')
    expect(f.childStart).not.toHaveBeenCalled()
  })
  it('applies explicit DSH subagent model restrictions and refuses non-Codex callers',async()=>{
    const f=fixture('enabled'),get=f.ctx.get
    f.ctx.get=(key:string)=>key==='subagentModelSelection'?{current:()=>({enabled:true,allowedModels:[{provider:'openai-codex',model:'test-codex'}]})}:get(key)
    await expect(f.controller.tool.execute({description:'Task',prompt:'Review',model:'other-model'},f.exec)).rejects.toThrow('not allowed')
    await expect(f.controller.tool.execute({description:'Task',prompt:'Review'},{...f.exec,agent:f.other})).rejects.toThrow('parent Codex')
  })
  it('tracks background cancellation and waits for native disposal during unload',async()=>{
    const f=fixture('enabled');f.childStart.mockImplementation(async(_provider:any,request:any)=>({id:'child',result:new Promise(r=>request.signal.addEventListener('abort',()=>r({stopReason:'aborted',output:[]}))),dispose:f.childDispose}) as any)
    const result=await f.controller.tool.execute({description:'Task',prompt:'Review',run_in_background:true},f.exec)
    expect(result).toEqual({kind:'background',jobId:'subagent-1'});expect(f.jobs.start.mock.calls[0][0].owner).toBe('session-1')
    expect(f.controller.status().active).toBe(1)
    await f.controller.dispose();expect((await f.jobs.hooks.done).status).toBe('failed');expect(f.childDispose).toHaveBeenCalledOnce();expect(f.controller.status().active).toBe(0)
  })
  it('job_kill uses owned cancellation and failures always dispose the child',async()=>{
    const f=fixture('enabled');f.childStart.mockImplementation(async(_provider:any,request:any)=>({id:'child',result:new Promise(r=>request.signal.addEventListener('abort',()=>r({stopReason:'aborted',output:[]}))),dispose:f.childDispose}) as any)
    await f.controller.tool.execute({description:'Task',prompt:'Review',run_in_background:true},f.exec)
    await Promise.resolve();f.jobs.hooks.cancel('stop');expect((await f.jobs.hooks.done).status).toBe('killed');expect(f.childDispose).toHaveBeenCalledOnce()
  })
  it('does not regrant delegation to restricted child scopes',async()=>{
    const f=fixture('enabled');f.parent.session.header={origin:'subagent'};f.controller.sync()
    expect(f.scopedRegister).not.toHaveBeenCalled()
    await expect(f.controller.tool.execute({description:'Task',prompt:'Review'},f.exec)).rejects.toThrow('parent Codex')
    expect(f.childStart).not.toHaveBeenCalled()
  })
  it('cleans up active ownership even when backend startup fails synchronously',async()=>{
    const f=fixture('enabled');f.childStart.mockImplementation(()=>{throw new Error('startup failed')})
    await expect(f.controller.tool.execute({description:'Task',prompt:'Review'},f.exec)).rejects.toThrow('startup failed')
    expect(f.controller.status().active).toBe(0)
  })
  it('rechecks the user switch after asynchronous model resolution',async()=>{
    const f=fixture('enabled');f.ctx.llm.resolveCallConfig.mockImplementation(async(value:any)=>{await f.controller.preference(false);return value})
    await expect(f.controller.tool.execute({description:'Task',prompt:'Review'},f.exec)).rejects.toThrow('availability changed')
    expect(f.childStart).not.toHaveBeenCalled()
  })
  it('bounds large foreground answers and retains the full result in owned Jobs',async()=>{
    const f=fixture('enabled'),text='x'.repeat(33000);f.childStart.mockResolvedValue({id:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text}]}),dispose:f.childDispose})
    const result=await f.controller.tool.execute({description:'Task',prompt:'Review'},f.exec)
    expect(result.truncated).toBe(true);expect(result.text.length).toBeLessThan(32100);expect((await f.jobs.hooks.done).result).toBe(text)
    expect(f.jobs.start.mock.calls[0][0].owner).toBe(f.parent.id)
  })
  it('returns a successful clipped answer even if Jobs refuses result retention',async()=>{
    const f=fixture('enabled'),text='x'.repeat(33000);f.childStart.mockResolvedValue({id:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text}]}),dispose:f.childDispose})
    f.jobs.start.mockImplementation(()=>{throw new Error('No controller serves this owner')})
    const result=await f.controller.tool.execute({description:'Task',prompt:'Review'},f.exec)
    expect(result.kind).toBe('foreground');expect(result.truncated).toBe(true);expect(result.text).toContain('storage is unavailable');expect(f.childDispose).toHaveBeenCalledOnce()
  })
  it('refuses background calls without native job controls before creating the child',async()=>{
    const f=fixture('enabled'),get=f.ctx.get;f.ctx.get=(key:string)=>key==='jobs'?undefined:get(key)
    await expect(f.controller.tool.execute({description:'Task',prompt:'Review',run_in_background:true},f.exec)).rejects.toThrow('job controls')
    expect(f.childStart).not.toHaveBeenCalled()
  })
  it('withdraws tool on route changes and refuses missing or unsuitable spawn',async()=>{
    const f=fixture('enabled');f.controller.sync();await f.listeners.get('agent/request')({agent:f.parent},async()=>({provider:'claude'}));expect(f.unregistered).toHaveBeenCalledOnce()
    f.ctx.subagents.getProvider.mockReturnValue(undefined);expect(f.controller.status().available).toBe(false)
    await expect(f.controller.preference(true)).rejects.toThrow('unavailable');await f.controller.preference(false)
  })
})
