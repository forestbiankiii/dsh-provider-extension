// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,describe,it,expect,vi } from 'vitest'
import { CodexConnectionSettings,requestCodexConnection } from '../src/client/CodexConnectionSettings.tsx'
import { CodexCompactionSettings } from '../src/client/CodexCompactionSettings.tsx'
import { en,zh } from '../src/client/locales.ts'
afterEach(cleanup)
describe('User-only SSE and WebSocket preference',()=>{
  it.each([en,zh])('reads SSE by default and saves only an explicit transport choice',async copy=>{
    let current='sse';const call=vi.fn(async(_api:string,route:string,payload:any)=>{if(route.endsWith('/update'))current=payload.connectionMode;return {ok:true,value:{connectionMode:current,connectionWritable:true,compactionMode:'dsh'}}})
    render(<CodexConnectionSettings rpc={{call} as never} t={key=>copy[key]}/>)
    const select=await screen.findByRole('combobox',{name:copy.codexConnection}) as HTMLButtonElement
    await waitFor(()=>expect(select.disabled).toBe(false));expect(select.value).toBe('sse');expect(call).toHaveBeenCalledOnce()
    fireEvent.click(select);fireEvent.click(screen.getByRole('option',{name:copy.codexConnectionWebsocket}))
    await screen.findByText(copy.codexConnectionSaved)
    expect(call).toHaveBeenLastCalledWith('/api','codex-subscription/preferences/update',{connectionMode:'websocket'},undefined)
    expect(select.value).toBe('websocket')
  })
  it('shows the cloud conflict without silently changing compression or acknowledging a rejected save',async()=>{
    const call=vi.fn(async(_api:string,route:string)=>route.endsWith('/update')?{ok:false,error:{code:'connection-mode-conflict',message:'Choose DSH compression first'}}:{ok:true,value:{connectionMode:'sse',connectionWritable:true,compactionMode:'cloud'}})
    render(<CodexConnectionSettings rpc={{call} as never} t={key=>zh[key]}/>)
    await screen.findByText(zh.codexConnectionCloudConflict)
    const select=screen.getByRole('combobox') as HTMLButtonElement;fireEvent.click(select);fireEvent.click(screen.getByRole('option',{name:zh.codexConnectionWebsocket}))
    expect(await screen.findByRole('alert')).toBeTruthy();expect(select.value).toBe('sse');expect(screen.queryByText(zh.codexConnectionSaved)).toBeNull()
    expect(call.mock.calls[1][1]).toBe('codex-subscription/preferences/update')
  })
  it('also displays the exclusion on the cloud control while WebSocket is selected',async()=>{
    render(<CodexCompactionSettings rpc={{call:async()=>({ok:true,value:{compactionMode:'dsh',compactionWritable:true,connectionMode:'websocket'}})} as never} t={key=>en[key]}/>)
    expect(await screen.findByText(en.codexConnectionCloudConflict)).toBeTruthy()
  })
  it('rejects unknown modes and malformed or unacknowledged response data',async()=>{
    const invalid=vi.fn();await expect(requestCodexConnection({call:invalid} as never,'auto' as never)).rejects.toThrow('Invalid');expect(invalid).not.toHaveBeenCalled()
    await expect(requestCodexConnection({call:async()=>({ok:true,value:{connectionMode:'sse',connectionWritable:true}})} as never,'websocket')).rejects.toThrow('did not accept')
    await expect(requestCodexConnection({call:async()=>({ok:true,value:{connectionMode:'auto',connectionWritable:true}})} as never)).rejects.toThrow('Invalid')
  })
})
