// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,describe,it,expect,vi } from 'vitest'
import { CodexSubtasksSettings,requestCodexSubtasks } from '../src/client/CodexSubtasksSettings.tsx'
import { en } from '../src/client/locales.ts'
const t=(key:keyof typeof en)=>en[key]
const base={enabled:false,writable:true,available:true,active:0,toolName:'codex_subtask'}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('User-only DSH Codex settings',()=>{
  it('reads status without starting a task and exposes only a toggle, not CLI installation',async()=>{
    const call=vi.fn(async(..._args:any[])=>({ok:true,value:base}))
    render(<CodexSubtasksSettings rpc={{call} as never} t={t}/>)
    const toggle=screen.getByRole('switch',{name:en.codexSubtasksEnabled}) as HTMLInputElement
    await waitFor(()=>expect(toggle.disabled).toBe(false));expect(toggle.checked).toBe(false)
    expect(call).toHaveBeenCalledOnce();expect(call.mock.calls[0][1]).toBe('codex-subscription/subtask/status')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
  it('saves an explicit opt-in and rejects a response that did not accept the requested state',async()=>{
    const call=vi.fn(async(_api:string,route:string,payload:any)=>({ok:true,value:route.endsWith('/preference')?{...base,enabled:payload.enabled}:base}))
    render(<CodexSubtasksSettings rpc={{call} as never} t={t}/>)
    const toggle=screen.getByRole('switch',{name:en.codexSubtasksEnabled}) as HTMLInputElement
    await waitFor(()=>expect(toggle.disabled).toBe(false));fireEvent.click(toggle)
    expect(await screen.findByText(en.codexSubtasksSaved)).toBeTruthy();expect(toggle.checked).toBe(true)
    expect(call.mock.calls[1]).toEqual(['/api','codex-subscription/subtask/preference',{enabled:true},undefined])
    await expect(requestCodexSubtasks({call:async()=>({ok:true,value:base})} as never,true)).rejects.toThrow('did not accept')
  })
  it('allows disabling after backend loss and validates untrusted response fields',async()=>{
    const call=vi.fn(async(_api:string,_route:string,payload:any)=>({ok:true,value:{...base,available:false,enabled:payload.enabled??true}}))
    render(<CodexSubtasksSettings rpc={{call} as never} t={t}/>)
    const toggle=screen.getByRole('switch',{name:en.codexSubtasksEnabled}) as HTMLInputElement
    await waitFor(()=>expect(toggle.disabled).toBe(false));fireEvent.click(toggle)
    await waitFor(()=>expect(call).toHaveBeenCalledTimes(2));expect(call.mock.calls[1][2]).toEqual({enabled:false})
    await expect(requestCodexSubtasks({call:async()=>({ok:true,value:{...base,active:-1}})} as never)).rejects.toThrow('Invalid')
  })
})
