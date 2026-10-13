import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProviderPanelKey } from './locales.ts'
import type { CodexImageAnnotation } from './codex-image-annotations.ts'
import { clamp, imagePoint, insideImage, type Point } from './image-studio-model.ts'
import { StudioDialog, StudioIcon } from './image-studio-modal.tsx'
import css from './ImageStudio.module.css'

export interface ImageEditRequest { annotations?: readonly CodexImageAnnotation[]; prompt?: string; source?: File; extra?: File[]; width?: number; height?: number }
interface Stroke { size: number; points: Point[] }
export function drawEraseMask(c: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, mask: boolean) {
  c.clearRect(0,0,w,h); if (mask) { c.fillStyle='#000000';c.fillRect(0,0,w,h) }
  c.strokeStyle=mask?'#ffffff':'rgba(255,59,48,.5)';c.fillStyle=c.strokeStyle;c.lineCap='round';c.lineJoin='round'
  for (const s of strokes) {
    const p=s.points[0];if (!p) continue
    c.lineWidth=s.size*Math.min(w,h);c.beginPath()
    if (s.points.length===1) { c.arc(p.x*w,p.y*h,c.lineWidth/2,0,Math.PI*2);c.fill() }
    else { c.moveTo(p.x*w,p.y*h);for (const q of s.points.slice(1)) c.lineTo(q.x*w,q.y*h);c.stroke() }
  }
}
export function CodexImageViewer({ src,width,height,name,t,onClose,onDownload,onStage,onSketch,annotations,onAnnotations,initialMark=false,canEdit=true,canAnnotate=true,canSketch=true }: {
  src:string;width:number;height:number;name:string;t:Translate<ProviderPanelKey>;onClose:()=>void;onDownload:()=>Promise<void>
  onStage:(request:ImageEditRequest)=>Promise<void>;onSketch:()=>void;annotations:CodexImageAnnotation[];onAnnotations:(marks:CodexImageAnnotation[])=>void;initialMark?:boolean;canEdit?:boolean;canAnnotate?:boolean;canSketch?:boolean
}) {
  const [mode,setMode]=useState<'pan'|'mark'|'erase'>(initialMark?'mark':'pan'),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0})
  const [size,setSize]=useState({w:1,h:1}),[selected,setSelected]=useState<number>(),[strokes,setStrokes]=useState<Stroke[]>([])
  const [brush,setBrush]=useState(.05),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ratioMenu,setRatioMenu]=useState(false),[copied,setCopied]=useState(false)
  const stage=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),mask=useRef<HTMLCanvasElement>(null),note=useRef<HTMLTextAreaElement>(null)
  const gesture=useRef<{id:number;x:number;y:number;pan:Point;kind:'pan'|'stroke'|'mark';mark?:number;moved:boolean}>()
  const alive=useRef(true),marksRef=useRef(annotations);marksRef.current=annotations
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{
    const el=stage.current!;const resize=()=>{const r=el.getBoundingClientRect();const f=Math.min(r.width/width,r.height/height,1);setSize({w:width*f,h:height*f})}
    resize();const observer=new ResizeObserver(resize);observer.observe(el);return()=>observer.disconnect()
  },[width,height])
  useEffect(()=>{if(selected!==undefined) note.current?.focus()},[selected])
  useEffect(()=>{const canvas=mask.current;if(canvas){const c=canvas.getContext('2d');if(c)drawEraseMask(c,strokes,width,height,false)}},[strokes,mode,width,height])
  const fit=()=>{setZoom(1);setPan({x:0,y:0})}
  const zoomAt=(value:number,cx?:number,cy?:number)=>{
    const z=clamp(value,.1,12),r=stage.current!.getBoundingClientRect(),x=(cx??r.left+r.width/2)-(r.left+r.width/2),y=(cy??r.top+r.height/2)-(r.top+r.height/2)
    setPan(p=>({x:x-(x-p.x)*z/zoom,y:y-(y-p.y)*z/zoom}));setZoom(z)
  }
  const invoke=async(action:()=>Promise<void>,close=false)=>{
    if(busy)return;setBusy(true);setError('')
    try { await action();if(alive.current&&close)onClose() }catch(e){if(alive.current)setError(t('studioError',{message:e instanceof Error?e.message:String(e)}))}
    finally {if(alive.current)setBusy(false)}
  }
  useEffect(()=>{if(!canEdit||(mode==='mark'&&!canAnnotate))setMode('pan')},[canEdit,canAnnotate])
  const pointerDown=(e:PointerEvent<HTMLDivElement>)=>{
    if(e.button!==0||busy)return
    const rect=surface.current!.getBoundingClientRect()
    if(mode!=='pan'&&!insideImage(e.clientX,e.clientY,rect))return
    e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId)
    const p=imagePoint(e.clientX,e.clientY,rect)
    gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,pan,kind:mode==='erase'?'stroke':mode==='mark'?'mark':'pan',moved:false}
    if(mode==='erase')setStrokes(s=>[...s,{size:brush,points:[p]}])
  }
  const pointerMove=(e:PointerEvent<HTMLDivElement>)=>{
    const g=gesture.current;if(!g||g.id!==e.pointerId)return
    if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>3)g.moved=true
    if(g.kind==='pan')setPan({x:g.pan.x+e.clientX-g.x,y:g.pan.y+e.clientY-g.y})
    else if(g.kind==='stroke') {const p=imagePoint(e.clientX,e.clientY,surface.current!.getBoundingClientRect());setStrokes(s=>s.length?[...s.slice(0,-1),{...s.at(-1)!,points:[...s.at(-1)!.points,p]}]:s)}
    else if(g.mark!==undefined){const p=imagePoint(e.clientX,e.clientY,surface.current!.getBoundingClientRect());onAnnotations(marksRef.current.map((m,i)=>i===g.mark?{...m,...p}:m))}
  }
  const pointerUp=(e:PointerEvent<HTMLDivElement>)=>{
    const g=gesture.current;if(!g||g.id!==e.pointerId)return;gesture.current=undefined
    if(g.kind==='mark'&&g.mark===undefined&&!g.moved&&annotations.length<20){const p=imagePoint(e.clientX,e.clientY,surface.current!.getBoundingClientRect());onAnnotations([...marksRef.current,{...p,note:''}]);setSelected(marksRef.current.length)}
  }
  const stageErase=async()=>{
    if(!strokes.length)throw new Error(t('studioMaskEmpty'))
    const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');if(!ctx)throw new Error('Canvas unavailable')
    drawEraseMask(ctx,strokes,width,height,true)
    const blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Mask encoding failed')),'image/png'))
    await onStage({prompt:t('studioEditErase'),extra:[new File([blob],'codex-erase-mask.png',{type:'image/png'})]})
  }
  return <StudioDialog title={t('studioPreview')} onClose={onClose} busy={busy}>
    <div className={css.viewerTitle}>{name} · {width} × {height}</div>
    <button type="button" className={css.close} aria-label={t('studioClose')} onClick={onClose} disabled={busy}><StudioIcon name="close"/></button>
    {mode==='erase'&&<div className={css.eraseBar} role="toolbar" aria-label={t('studioErase')}>
      <label>{t('studioBrushSize')}<input type="range" min=".01" max=".15" step=".01" value={brush} onChange={e=>setBrush(Number(e.target.value))}/></label>
      <button type="button" className={css.tool} disabled={!strokes.length||busy} onClick={()=>setStrokes(s=>s.slice(0,-1))}>{t('studioUndo')}</button>
      <button type="button" className={css.tool} onClick={()=>{setMode('pan');setStrokes([])}} disabled={busy}>{t('codexAnnotationCancel')}</button>
      <button type="button" className={css.primary} disabled={!strokes.length||busy} onClick={()=>void invoke(stageErase,true)}>{t(busy?'studioPending':'studioContinue')}</button>
    </div>}
    <div ref={stage} tabIndex={0} className={css.stage} data-mode={mode} aria-label={t('studioPreview')}
      onKeyDown={e=>{
        if(busy||e.target instanceof Element&&e.target.closest('input,textarea,button,a,select'))return
        if(e.key==='+'||e.key==='='){e.preventDefault();zoomAt(zoom*1.2)}
        else if(e.key==='-'){e.preventDefault();zoomAt(zoom/1.2)}
        else if(e.key.toLowerCase()==='f'){e.preventDefault();fit()}
        else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&mode==='erase'){e.preventDefault();setStrokes(s=>s.slice(0,-1))}
        else if(e.key==='Enter'&&mode==='mark'&&annotations.length<20){e.preventDefault();const index=annotations.length;onAnnotations([...annotations,{x:.5,y:.5,note:''}]);setSelected(index)}
      }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{gesture.current=undefined}}
      onWheel={e=>{e.preventDefault();zoomAt(zoom*Math.exp(-e.deltaY*.001),e.clientX,e.clientY)}}
      onDoubleClick={()=>{if(mode==='pan'){if(zoom===1)zoomAt(width/size.w);else fit()}}}>
      <div ref={surface} className={css.surface} style={{width:size.w,height:size.h,transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}>
        <img src={src} alt={name} draggable={false}/>{mode==='erase'&&<canvas ref={mask} width={width} height={height}/>}
      </div>
      {annotations.map((m,i)=>{const x=size.w*zoom*(m.x-.5)+pan.x,y=size.h*zoom*(m.y-.5)+pan.y;return <button key={i} type="button" className={css.notePin} aria-label={t('studioEditNote',{number:i+1})} aria-pressed={selected===i}
        style={{left:`calc(50% + ${x}px)`,top:`calc(50% + ${y}px)`}}
        onPointerDown={e=>{if(!canEdit||!canAnnotate||busy)return;e.stopPropagation();e.preventDefault();stage.current!.setPointerCapture(e.pointerId);gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,pan,kind:'mark',mark:i,moved:false};setSelected(i)}} onClick={e=>{e.stopPropagation();setSelected(i)}}>{i+1}</button>})}
      {selected!==undefined&&annotations[selected]&&<div className={css.note} style={{left:`clamp(8px,calc(50% + ${pan.x+size.w*zoom*(annotations[selected]!.x-.5)-140}px),calc(100% - 308px))`,top:`clamp(8px,calc(50% + ${pan.y+size.h*zoom*(annotations[selected]!.y-.5)-80}px),calc(100% - 100px))`}}
        onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
        <span>{selected+1}</span><textarea ref={note} rows={2} maxLength={500} disabled={!canEdit||!canAnnotate} aria-label={t('studioEditNote',{number:selected+1})} value={annotations[selected]!.note} placeholder={t('codexAnnotationNotePlaceholder')}
          onChange={e=>onAnnotations(annotations.map((m,i)=>i===selected?{...m,note:e.target.value}:m))}
          onKeyDown={e=>{if((e.key==='Enter'&&!e.shiftKey)||e.key==='Escape'){e.preventDefault();e.stopPropagation();setSelected(undefined)}}}/>
        <button type="button" className={css.tool} aria-label={t('studioRemoveMark')} disabled={!canEdit||!canAnnotate} onClick={()=>{onAnnotations(annotations.filter((_,i)=>i!==selected));setSelected(undefined)}}><StudioIcon name="close"/></button>
      </div>}
    </div>
    <p className={css.notice} role={error?'alert':'status'}>{error||t(mode==='erase'?'studioEraseHint':'studioNotice')}</p>
    <div className={css.toolbar} role="toolbar" aria-label={t('studioPreview')}>
      <button type="button" className={css.tool} title={t('studioPan')} aria-label={t('studioPan')} aria-pressed={mode==='pan'} onClick={()=>{setMode('pan');setSelected(undefined)}}><StudioIcon name="pan"/></button>
      <button type="button" className={css.tool} title={t('studioMark')} aria-label={t('studioMark')} aria-pressed={mode==='mark'} disabled={!canEdit||!canAnnotate} onClick={()=>setMode(mode==='mark'?'pan':'mark')}><StudioIcon name="mark"/></button>
      <button type="button" className={css.tool} aria-label={t('studioZoomOut')} onClick={()=>zoomAt(zoom/1.2)}>−</button>
      <button type="button" className={css.tool} title={t('studioFit')} onClick={fit}>{Math.round(zoom*size.w/width*100)}%</button>
      <button type="button" className={css.tool} aria-label={t('studioZoomIn')} onClick={()=>zoomAt(zoom*1.2)}>+</button>
      <button type="button" className={css.tool} onClick={()=>zoomAt(width/size.w)}>{t('studioActual')}</button><span className={css.divider}/>
      <button type="button" className={css.tool} title={t('studioDownload')} aria-label={t('studioDownload')} disabled={busy} onClick={()=>void invoke(onDownload)}><StudioIcon name="download"/></button>
      <button type="button" className={css.tool} title={t('studioRemoveBackground')} aria-label={t('studioRemoveBackground')} disabled={busy||!canEdit} onClick={()=>void invoke(()=>onStage({prompt:t('studioEditBackground')}),true)}><StudioIcon name="background"/></button>
      <button type="button" className={css.tool} title={t('studioErase')} aria-label={t('studioErase')} aria-pressed={mode==='erase'} disabled={!canEdit} onClick={()=>{setMode('erase');setSelected(undefined)}}><StudioIcon name="erase"/></button>
      <div style={{position:'relative'}}><button type="button" className={css.tool} title={t('studioRatio')} aria-label={t('studioRatio')} aria-expanded={ratioMenu} disabled={!canEdit} onClick={()=>setRatioMenu(v=>!v)}><StudioIcon name="ratio"/></button>
        {ratioMenu&&<div className={css.menu}>{['1:1','3:4','9:16','4:3','16:9'].map(r=><button type="button" className={css.tool} key={r} disabled={busy} onClick={()=>void invoke(()=>onStage({prompt:t('studioEditRatio',{ratio:r})}),true)}>{r}</button>)}</div>}
      </div>
      <button type="button" className={css.tool} title={t('studioSketch')} aria-label={t('studioSketch')} disabled={!canSketch} onClick={onSketch}><StudioIcon name="pen"/></button>
      <button type="button" className={css.primary} disabled={busy||!canEdit||mode==='erase'||annotations.some(m=>!m.note.trim())} onClick={()=>void invoke(()=>onStage(annotations.length?{annotations}:{prompt:t('studioSketchPrompt')}),true)}>{t(busy?'studioPending':'studioContinue')}</button>
      {annotations.length>0&&<button type="button" className={css.tool} onClick={()=>void invoke(async()=>{await navigator.clipboard.writeText(annotations.map((m,i)=>`${i+1} (${(m.x*100).toFixed(2)}%, ${(m.y*100).toFixed(2)}%): ${m.note}`).join('\n'));setCopied(true)})}>{t(copied?'studioCopied':'studioCopy')}</button>}
    </div>
  </StudioDialog>
}
