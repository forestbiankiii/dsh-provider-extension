/** Opt-in Codex subscription delegation through DSH; no CLI or provider replacement. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { createEnumOwner, volatileEnum, type EnumConfig } from './enum-preference.ts'
export type CodexSubtasksConfig=EnumConfig<'disabled'|'enabled'>
export const codexSubtasksSchema=volatileEnum(['disabled','enabled'] as const,'disabled','Independent Codex subscription tasks on DSH spawn; may consume subscription usage. No CLI installation or replacement of existing subagents.')
export const SUBTASK_TOOL='codex_subtask'
const callSchema=z.object({description:z.string().trim().min(1).max(256),prompt:z.string().trim().min(1).max(16384),model:z.string().trim().min(1).max(256).optional(),reasoning_effort:z.string().trim().min(1).max(32).optional(),run_in_background:z.boolean().optional()}).strict()
export function createCodexSubtasksOwner(ctx:Context,config?:CodexSubtasksConfig){return createEnumOwner(ctx,config,'codexSubtasks',['disabled','enabled'] as const,'disabled','Codex independent subtasks')}
export function createCodexSubtasks(ctx:any,owner:ReturnType<typeof createCodexSubtasksOwner>){
  let disposed=false
  const active=new Map<AbortController,Promise<unknown>>(),scopedTools=new Map<any,()=>void>(),listeners:Array<()=>void>=[]
  const services=()=>{const provider=ctx.subagents?.getProvider?.('spawn');return provider?.inheritsParentContext===false&&provider.capabilities?.agentOptions===true&&provider.capabilities?.depthLimit===true&&typeof ctx.subagents.resolveMaxDepth==='function'&&typeof ctx.subagents.start==='function'&&typeof ctx.llm?.resolveCallConfig==='function'}
  const available=()=>!disposed&&owner.current()==='enabled'&&services()
  const collect=async(run:any)=>{try{const result=await run.result;if(result.stopReason!=='completed')throw new Error(`Codex subtask ended: ${String(result.stopReason)}`);return result.output.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('')}finally{await run.dispose()}}
  const tool={...defineTool({name:SUBTASK_TOOL,
    description:'Delegate a self-contained task to a fresh DSH child using the Codex subscription, when the user requests Codex delegation. Shares the parent workspace and DSH delegated permissions, not its conversation. May edit allowed files and consume subscription usage. Existing subagent and subagent_fork tools are unchanged; no native Codex CLI is used.',
    parameters:{description:{type:'string',required:true,description:'Short task label, 1–256 characters.'},prompt:{type:'string',required:true,description:'Complete task, constraints and file context, 1–16384 characters; the child does not see this conversation.'},model:{type:'string',description:'Advertised Codex model id, at most 256 characters. Omit to use the current Codex session model; never falls back to another provider.'},reasoning_effort:{type:'string',description:'Effort id supported by the selected model, at most 32 characters. Omit to inherit on the same parent model, otherwise use the model default.'},run_in_background:{type:'boolean',description:'Defaults false. True returns an owned job id; collect with job_output and stop with job_kill. Cancellation does not undo edits.'}},
    output:{schema:{type:'object',additionalProperties:false,properties:{kind:{type:'string',required:true},text:{type:'string'},jobId:{type:'string'},truncated:{type:'boolean'}}},render:(_args:any,value:any)=>[{type:'text',text:value.kind==='background'?`Started Codex subscription job ${value.jobId}`:value.text}]},isConcurrencySafe:()=>true,
    async execute(raw:any,exec:any){
      const args=callSchema.parse(raw);if(!exec.agent||!available())throw new Error('Codex subtasks are disabled or DSH spawn is unavailable')
      const parent=exec.agent,selected=parent.session?.requestHeader?.()?.config??parent.options??{}
      if(selected.provider!=='openai-codex'||parent.session?.header?.origin==='subagent')throw new Error('Codex delegation is only enabled on a parent Codex conversation')
      const model=args.model??selected.model;if(typeof model!=='string'||!model)throw new Error('Select a Codex subtask model')
      const effort=args.reasoning_effort??(model===selected.model?selected.reasoningEffort:undefined)
      const policy=ctx.get?.('subagentModelSelection')?.current?.()
      if(policy?.enabled&&(args.model!==undefined||args.reasoning_effort!==undefined)&&!policy.allowedModels?.some((route:any)=>route.provider==='openai-codex'&&route.model===model))throw new Error('Codex model is not allowed by DSH subagent model settings')
      const models=await ctx.llm.listModels('openai-codex');if(!models.some((m:any)=>m.id===model))throw new Error('Codex subtask model is not advertised by the current account')
      const resolved=await ctx.llm.resolveCallConfig({provider:'openai-codex',model,...(effort?{reasoningEffort:effort}:{})},exec.signal)
      exec.signal.throwIfAborted();if(!available())throw new Error('Codex subtask availability changed')
      const request={parent,label:args.description,prompt:[{type:'text',text:args.prompt}],maxDepth:ctx.subagents.resolveMaxDepth(),agentOptions:{provider:'openai-codex',model,...(resolved.reasoningEffort?{reasoningEffort:resolved.reasoningEffort}:{})}}
      const start=(signal:AbortSignal)=>{
        if(!available())return Promise.reject(new Error('Codex subtasks are unavailable'))
        const c=new AbortController(),combined=AbortSignal.any([signal,c.signal])
        const done=Promise.resolve().then(async()=>{try{combined.throwIfAborted();if(!available())throw new Error('Codex subtasks are unavailable');return await collect(await ctx.subagents.start('spawn',{...request,signal:combined}))}finally{active.delete(c)}})
        active.set(c,done);return done
      }
      const jobs=ctx.get?.('jobs')
      if(args.run_in_background){if(!jobs)throw new Error('Background job controls are unavailable');const jobId=jobs.start({kind:'subagent',label:args.description,owner:parent.id,run:()=>{const cancel=new AbortController();return {cancel:(reason?:string)=>cancel.abort(reason),done:(async()=>{try{return {status:'completed',result:await start(cancel.signal)}}catch(error){return {status:cancel.signal.aborted?'killed':'failed',detail:String(error).slice(0,2048)}}})()}}});return {kind:'background',jobId}}
      const text=await start(exec.signal);if(text.length<=32000)return {kind:'foreground',text}
      if(!jobs)return {kind:'foreground',text:text.slice(0,32000),truncated:true}
      try{const jobId=jobs.start({kind:'subagent',label:args.description,owner:parent.id,run:()=>({cancel:()=>{},done:Promise.resolve({status:'completed',result:text})})});return {kind:'foreground',text:text.slice(0,32000)+`\nFull result: job_output ${jobId}`,jobId,truncated:true}}
      catch{return {kind:'foreground',text:text.slice(0,32000)+'\n[Truncated: result storage is unavailable for this session.]',truncated:true}}
    }}),deferLoading:true as const}
  const syncAgent=(agent:any,route?:string)=>{
    const provider=route??agent.session?.requestHeader?.()?.config?.provider??agent.options?.provider
    if(!available()||provider!=='openai-codex'||agent.session?.header?.origin==='subagent'){scopedTools.get(agent)?.();scopedTools.delete(agent);return}
    if(scopedTools.has(agent))return
    const tools=agent.ctx?.get?.('tools');if(!tools)return
    const dispose=agent.ctx.effect(()=>tools.register(tool),'provider extension: scoped Codex subtask tool');scopedTools.set(agent,dispose)
  }
  const sync=()=>{for(const agent of ctx.get?.('agents')?.list?.()??[])syncAgent(agent)}
  if(ctx.on){listeners.push(ctx.on('agent/created',({agent}:any)=>syncAgent(agent)),ctx.on('agent/disposed',({agent}:any)=>{scopedTools.get(agent)?.();scopedTools.delete(agent)}),ctx.on('agent/request',async({agent}:any,next:()=>Promise<any>)=>{const value=await next();syncAgent(agent,value.provider);return value}),ctx.on('subagent/provider-added',sync),ctx.on('subagent/provider-removed',sync))}
  const status=()=>{sync();return {enabled:owner.current()==='enabled',writable:owner.writable,available:services(),active:active.size,toolName:SUBTASK_TOOL}}
  return {tool,status,sync,
    async preference(enabled:boolean,signal?:AbortSignal){if(enabled&&!services())throw new Error('DSH spawn is unavailable');await owner.save(enabled?'enabled':'disabled',signal);sync();return status()},
    async dispose(){disposed=true;for(const dispose of listeners)dispose();for(const dispose of scopedTools.values())dispose();scopedTools.clear();for(const c of active.keys())c.abort();await Promise.allSettled([...active.values()])}}
}
export function mountCodexSubtasks(ctx:Context,owner:ReturnType<typeof createCodexSubtasksOwner>){const controller=createCodexSubtasks(ctx,owner);controller.sync();ctx.effect(()=>()=>controller.dispose(),'provider extension: Codex child lifetime');return controller}
