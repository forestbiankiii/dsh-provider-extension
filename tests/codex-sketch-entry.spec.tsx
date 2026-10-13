// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexSketchDock } from '../src/client/CodexSketchDock.tsx'
import { en } from '../src/client/locales.ts'

vi.mock('../src/client/CodexSketchBoard.tsx',()=>({CodexSketchBoard:()=> <div role="dialog" aria-label="Sketch board"/>}))
afterEach(()=>cleanup())
function props(isCodex=true){
  const call=vi.fn(async()=>({ok:true,value:{imageSketch:true,imageEditing:true,imageAnnotations:true,imageLimits:{maxImageBytes:200000,maxImagesPerMessage:4,maxMessageImageBytes:400000,maxImagePixels:1000000,maxImageDimension:1024,mediaTypes:['image/png']}}}))
  return {rpc:{call} as never,sessionId:'session-1' as never,t:(key:keyof typeof en)=>en[key],conversation:undefined,inputActions:{} as never,useInput:((select:(value:unknown)=>unknown)=>select({draft:'',phase:'plain',draftRev:0,attachmentIds:[],occurrences:[]})) as never,isCodexRoute:()=>isCodex,call}
}
describe('Sketch composer toolbar entry',()=>{
  it('uses an accessible icon-sized button rather than a standalone text dock',async()=>{
    const p=props();render(<CodexSketchDock {...p}/>)
    const button=screen.getByRole('button',{name:en.studioSketch})
    expect(button.textContent).toBe('')
    expect(button.getAttribute('title')).toBe(en.studioSketch)
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.className).toContain('codexSketchTrigger')
    expect(p.call).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(await screen.findByRole('dialog',{name:en.studioSketch})).toBeTruthy()
    expect(p.call.mock.calls).toHaveLength(1)
  })
  it('does not occupy the toolbar in non-Codex sessions',()=>{
    render(<CodexSketchDock {...props(false)}/>)
    expect(screen.queryByRole('button',{name:en.studioSketch})).toBeNull()
  })
})
