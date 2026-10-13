// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { CodexImageViewer } from '../src/client/CodexImageViewer.tsx'
import { CodexSketchBoard } from '../src/client/CodexSketchBoard.tsx'
import { en } from '../src/client/locales.ts'
import { DRAWING_STORAGE } from '../src/client/image-studio-model.ts'
import { fitEraseMask } from '../src/client/image-studio-images.ts'
import type { CodexImageAnnotation } from '../src/client/codex-image-annotations.ts'
const t=(key:keyof typeof en,params?:Record<string,unknown>)=>en[key].replace(/\{(\w+)\}/g,(_,key:string)=>String(params?.[key]??''))
let context:Record<string,any>
beforeEach(()=>{
  localStorage.clear()
  if(!HTMLDialogElement.prototype.showModal)HTMLDialogElement.prototype.showModal=function(){}
  if(!HTMLDialogElement.prototype.close)HTMLDialogElement.prototype.close=function(){}
  vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(){this.setAttribute('open','')})
  vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(){this.removeAttribute('open')})
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})
  vi.stubGlobal('PointerEvent',MouseEvent);HTMLElement.prototype.setPointerCapture=vi.fn()
  vi.spyOn(HTMLDivElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:200,height:200} as DOMRect)
  context=Object.fromEntries(['clearRect','fillRect','drawImage','save','restore','translate','scale','beginPath','rect','ellipse','arc','moveTo','lineTo','quadraticCurveTo','stroke','fill','fillText','setLineDash'].map(k=>[k,vi.fn()]))
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context as never)
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(done=>done(new Blob(['png'],{type:'image/png'})))
})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
function viewer(onStage=vi.fn(async()=>{})){
  function Harness(){const[marks,setMarks]=useState<CodexImageAnnotation[]>([]);return <CodexImageViewer src="blob:source" width={200} height={200} name="Source" t={t} onClose={vi.fn()} onDownload={vi.fn(async()=>{})} onSketch={vi.fn()} onStage={onStage} annotations={marks} onAnnotations={setMarks}/>}
  const result=render(<Harness/>);return {...result,onStage,stage:screen.getByLabelText(en.studioPreview,{selector:'div[data-mode]'})}
}
describe('Large image studio interactions',()=>{
  it('does not browser-drag images; separates panning, pins and dragging existing pins',()=>{
    const {stage,onStage}=viewer()
    expect(screen.getByRole('img',{name:'Source'}).getAttribute('draggable')).toBe('false')
    fireEvent.pointerDown(stage,{button:0,clientX:50,clientY:60});fireEvent.pointerMove(stage,{clientX:100,clientY:100});fireEvent.pointerUp(stage,{clientX:100,clientY:100})
    expect(screen.queryByRole('button',{name:'Edit note 1'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:en.studioMark}))
    fireEvent.pointerDown(stage,{button:0,clientX:50,clientY:60});fireEvent.pointerUp(stage,{clientX:50,clientY:60})
    const pin=screen.getByRole('button',{name:'Edit note 1'})
    fireEvent.change(screen.getByRole('textbox',{name:'Edit note 1'}),{target:{value:'Change the sky'}})
    fireEvent.pointerDown(pin,{button:0,clientX:50,clientY:60});fireEvent.pointerMove(stage,{clientX:80,clientY:120});fireEvent.pointerUp(stage,{clientX:80,clientY:120})
    fireEvent.click(screen.getByRole('button',{name:en.studioContinue}))
    expect(onStage).toHaveBeenCalledWith({annotations:[{x:.4,y:.6,note:'Change the sky'}]})
  })
  it('ignores margin clicks and disables editing tools when the edit switch is off',()=>{
    const {stage}=viewer()
    fireEvent.click(screen.getByRole('button',{name:en.studioMark}))
    fireEvent.pointerDown(stage,{button:0,clientX:-10,clientY:20});fireEvent.pointerUp(stage,{clientX:-10,clientY:20})
    expect(screen.queryByRole('button',{name:'Edit note 1'})).toBeNull()
    cleanup()
    render(<CodexImageViewer src="blob:source" width={200} height={200} name="Source" t={t} onClose={vi.fn()} onDownload={vi.fn(async()=>{})} onSketch={vi.fn()} onStage={vi.fn(async()=>{})} annotations={[]} onAnnotations={vi.fn()} canEdit={false} canSketch={false}/>)
    for(const name of [en.studioMark,en.studioErase,en.studioRemoveBackground,en.studioContinue,en.studioSketch])expect((screen.getByRole('button',{name}) as HTMLButtonElement).disabled).toBe(true)
  })
  it('fits an original-size mask to the clean source raster and closes the bitmap',async()=>{
    const close=vi.fn();vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:1254,height:1254,close})))
    const source=new File(['mask'],'codex-erase-mask.png',{type:'image/png'})
    const file=await fitEraseMask(source,512,512)
    expect(file.name).toBe(source.name);expect(file.type).toBe('image/png')
    expect(context.imageSmoothingEnabled).toBe(false)
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(),0,0,512,512)
    expect(close).toHaveBeenCalledOnce()
  })
  it('keeps all top controls and the close button in three aligned header groups',()=>{
    render(<CodexSketchBoard t={t} onClose={vi.fn()} onAttach={vi.fn(async()=>{})}/>)
    const close=screen.getByRole('button',{name:en.studioClose}),header=close.closest('header')
    expect(header).toBeTruthy()
    expect(header?.children).toHaveLength(3)
    expect(close.parentElement?.className).toContain('headerActions')
    expect(screen.getByRole('button',{name:en.studioAttach}).parentElement).toBe(close.parentElement)
    expect(screen.getByRole('combobox',{name:en.studioRatio}).parentElement?.className).toContain('headerSettings')
    expect(screen.getByRole('button',{name:en.studioDrafts}).parentElement?.className).toContain('headerLeading')
  })
  it('keeps unsaved session drawings when the board is closed and reopened',()=>{
    const sessionKey=crypto.randomUUID(),attach=vi.fn(async()=>{})
    const first=render(<CodexSketchBoard t={t} sessionKey={sessionKey} onClose={vi.fn()} onAttach={attach}/>)
    const board=first.container.querySelector('div[class*="board_"]')!
    fireEvent.pointerDown(board,{button:0,clientX:20,clientY:30});fireEvent.pointerUp(board,{clientX:20,clientY:30})
    first.unmount()
    render(<CodexSketchBoard t={t} sessionKey={sessionKey} onClose={vi.fn()} onAttach={attach}/>)
    const draftsButton=screen.getByRole('button',{name:en.studioDrafts})
    expect(fireEvent.keyDown(draftsButton,{code:'Space',key:' '})).toBe(true)
    fireEvent.click(draftsButton);fireEvent.click(screen.getByRole('button',{name:en.studioSave}))
    expect(JSON.parse(localStorage.getItem(DRAWING_STORAGE)!)[0].document.layers[0].objects).toHaveLength(1)
  })
  it('builds a black-and-white erase mask only after explicit continue',async()=>{
    const {stage,onStage}=viewer()
    fireEvent.click(screen.getByRole('button',{name:en.studioErase}))
    fireEvent.pointerDown(stage,{button:0,clientX:40,clientY:40});fireEvent.pointerMove(stage,{clientX:70,clientY:80});fireEvent.pointerUp(stage,{clientX:70,clientY:80})
    expect(onStage).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button',{name:en.studioContinue})[0]!)
    await waitFor(()=>expect(onStage).toHaveBeenCalledOnce())
    expect(onStage.mock.calls[0]?.[0]?.extra?.[0]?.name).toBe('codex-erase-mask.png')
    expect(context.fillRect).toHaveBeenCalled()
  })
  it('creates editable drawings, undo/redo and layer visibility, then restores a saved draft',async()=>{
    const attach=vi.fn(async()=>{})
    const result=render(<CodexSketchBoard t={t} onClose={vi.fn()} onAttach={attach}/>)
    const board=result.container.querySelector('div[class*="board_"]')!
    fireEvent.pointerDown(board,{button:0,clientX:30,clientY:30});fireEvent.pointerMove(board,{clientX:90,clientY:60});fireEvent.pointerUp(board,{clientX:90,clientY:60})
    fireEvent.click(screen.getByRole('button',{name:en.studioUndo}));fireEvent.click(screen.getByRole('button',{name:en.studioRedo}))
    fireEvent.click(screen.getByRole('button',{name:en.studioDrafts}))
    fireEvent.change(screen.getByRole('textbox',{name:en.studioDraftName}),{target:{value:'Test sketch'}})
    fireEvent.click(screen.getByRole('button',{name:en.studioSave}))
    fireEvent.click(screen.getByRole('button',{name:/^Layers 1$/}))
    fireEvent.click(screen.getByRole('checkbox',{name:'Show layer 1'}))
    fireEvent.click(screen.getByRole('button',{name:en.studioSave}))
    const saved=JSON.parse(localStorage.getItem(DRAWING_STORAGE)!)
    expect(saved[0].document.layers[0].visible).toBe(false)
    expect(saved[0].document.layers[0].objects).toHaveLength(1)
    expect(saved[0].document.layers[0].objects[0].points).toHaveLength(2)
    expect(attach).not.toHaveBeenCalled()
    result.unmount()
    render(<CodexSketchBoard t={t} onClose={vi.fn()} onAttach={attach}/>)
    fireEvent.click(screen.getByRole('button',{name:en.studioDrafts}));fireEvent.click(screen.getByRole('button',{name:'Test sketch'}))
    fireEvent.click(screen.getByRole('button',{name:en.studioAttach}))
    await waitFor(()=>expect(attach).toHaveBeenCalledOnce())
    expect(attach.mock.calls[0]?.[0]?.name).toBe('codex-sketch.png')
  })
})
