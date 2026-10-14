// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,describe,it,expect,vi } from 'vitest'
import { CodexCompactionSettings,requestCodexCompaction } from '../src/client/CodexCompactionSettings.tsx'
import { en,zh } from '../src/client/locales.ts'
afterEach(cleanup)
describe('Cloud compaction user preference',()=>{
  it.each([en,zh])('defaults to DSH and only saves the preference after an explicit selection',async copy=>{
    let current='dsh';const call=vi.fn(async(_api:string,route:string,payload:any)=>{if(route.endsWith('/update'))current=payload.compactionMode;return {ok:true,value:{compactionMode:current,compactionWritable:true}}})
    render(<CodexCompactionSettings rpc={{call} as never} t={key=>copy[key]}/>)
    const select=await screen.findByRole('combobox',{name:copy.codexCompaction}) as HTMLButtonElement
    await waitFor(()=>expect(select.disabled).toBe(false));expect(select.value).toBe('dsh');expect(call).toHaveBeenCalledOnce()
    fireEvent.click(select);fireEvent.click(screen.getByRole('option',{name:copy.codexCompactionCloud}))
    await screen.findByText(copy.codexCompactionSaved)
    expect(call).toHaveBeenLastCalledWith('/api','codex-subscription/preferences/update',{compactionMode:'cloud'},undefined)
    expect(select.value).toBe('cloud')
  })
  it('rejects unsupported/read-only/unacknowledged results and makes no invalid request',async()=>{
    const call=vi.fn(async()=>({ok:true,value:{compactionMode:'dsh',compactionWritable:false}}))
    render(<CodexCompactionSettings rpc={{call} as never} t={key=>en[key]}/>)
    await screen.findByText(en.codexVerbosityReadOnly)
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true)
    await expect(requestCodexCompaction({call} as never,'cloud')).rejects.toThrow('did not accept')
    const invalid=vi.fn();await expect(requestCodexCompaction({call:invalid} as never,'other' as never)).rejects.toThrow('Invalid');expect(invalid).not.toHaveBeenCalled()
  })
})
