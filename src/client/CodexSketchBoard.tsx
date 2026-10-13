import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProviderPanelKey } from './locales.ts'
import { StudioDialog, StudioIcon } from './image-studio-modal.tsx'
import { canvasPng, clamp, decodeDrawing, downloadBlob, DRAWING_STORAGE, hitObject, imageFile, imagePoint, insideImage, loadDrawings, newDrawing, objectBounds, renderDrawing, saveDrawing, smoothPoints, type DrawingDocument, type DrawingObject, type DrawTool, type Point, type SavedDrawing } from './image-studio-model.ts'
import css from './ImageStudio.module.css'

// Unsaved UI state survives closing the studio within this page; export/save for restarts.
const sessionDrawings = new Map<string, { document: DrawingDocument; name: string; id?: string; dirty: boolean }>()
const toolKeys = {select:'studioSelect',pan:'studioPan',pen:'studioPen',pencil:'studioPencil',highlighter:'studioHighlighter',eraser:'studioEraser','object-eraser':'studioObjectEraser',line:'studioLine',arrow:'studioArrow',rectangle:'studioRectangle',ellipse:'studioEllipse',curve:'studioCurve',text:'studioText'} as const
export function CodexSketchBoard({ t, onClose, onAttach, src, sessionKey }: { t:Translate<ProviderPanelKey>;onClose:()=>void;onAttach:(file:File,width:number,height:number)=>Promise<void>;src?:string;sessionKey?:string }) {
  const savedSession = sessionKey ? sessionDrawings.get(sessionKey) : undefined
  const [doc,setDoc]=useState<DrawingDocument>(()=>savedSession?.document??newDrawing()),[layerId,setLayerId]=useState(''),[tool,setTool]=useState<DrawTool>('pen')
  const [color,setColor]=useState('#171717'),[width,setWidth]=useState(8),[opacity,setOpacity]=useState(1),[smooth,setSmooth]=useState(.35),[text,setText]=useState('')
  const [selected,setSelected]=useState<string>(),[layersOpen,setLayersOpen]=useState(false),[filesOpen,setFilesOpen]=useState(false)
  const [drafts,setDrafts]=useState<SavedDrawing[]>(()=>loadDrawings(localStorage)),[draftName,setDraftName]=useState(savedSession?.name??''),[draftId,setDraftId]=useState<string|undefined>(savedSession?.id),[dirty,setDirty]=useState(savedSession?.dirty??false)
  const [zoom,setZoom]=useState(1),[pan,setPan]=useState<Point>({x:0,y:0}),[fitSize,setFitSize]=useState({w:1,h:1}),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('')
  const board=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),input=useRef<HTMLInputElement>(null),images=useRef(new Map<string,HTMLImageElement>())
  const latest=useRef(doc);latest.current=doc
  const sessionDraft=useRef({document:doc,name:draftName,...draftId?{id:draftId}:{},dirty})
  sessionDraft.current={document:doc,name:draftName,...draftId?{id:draftId}:{},dirty}
  useEffect(()=>()=>{
    if(sessionKey){
      sessionDrawings.delete(sessionKey)
      if(sessionDrawings.size>=20)sessionDrawings.delete(sessionDrawings.keys().next().value!)
      const activeGesture=gesture.current
      sessionDrawings.set(sessionKey,{...sessionDraft.current,document:activeGesture&&activeGesture.kind!=='pan'?activeGesture.before:sessionDraft.current.document})
    }
  },[sessionKey])
  const history=useRef<DrawingDocument[]>([]),future=useRef<DrawingDocument[]>([]),space=useRef(false)
  const gesture=useRef<{id:number;start:Point;client:Point;before:DrawingDocument;pan:Point;object?:DrawingObject;move?:string;kind:'draw'|'move'|'pan'|'erase'}>()
  const life=useRef(true),renderRevision=useRef(0)
  const activeLayer=doc.layers.find(l=>l.id===(layerId||doc.layers[0]!.id))??doc.layers[0]!
  const selectedObject=activeLayer.objects.find(o=>o.id===selected)
  const pushHistory=(before=latest.current)=>{history.current=[...history.current.slice(-49),structuredClone(before)];future.current=[];setDirty(true)}
  const commit=(next:DrawingDocument)=>{pushHistory();setDoc(next)}
  const mutateLayer=(update:(l:typeof activeLayer)=>typeof activeLayer)=>commit({...doc,layers:doc.layers.map(l=>l.id===activeLayer.id?update(l):l)})
  const undo=()=>{const prev=history.current.pop();if(prev){future.current.push(latest.current);setDoc(prev);setSelected(undefined);setDirty(true)}}
  const redo=()=>{const next=future.current.pop();if(next){history.current.push(latest.current);setDoc(next);setSelected(undefined);setDirty(true)}}
  const fit=()=>{setZoom(1);setPan({x:0,y:0})}
  const replace=(next:DrawingDocument,id?:string,name='')=>{if(dirty&&!window.confirm(t('studioUnsaved')))return;history.current=[];future.current=[];setDoc(next);setLayerId(next.layers[0]!.id);setSelected(undefined);setDraftId(id);setDraftName(name);setDirty(false);fit()}
  useEffect(()=>{life.current=true;return()=>{life.current=false}},[])
  useEffect(()=>{
    const resize=()=>{const r=board.current!.getBoundingClientRect(),f=Math.min(r.width/doc.width,r.height/doc.height)*.92;setFitSize({w:doc.width*f,h:doc.height*f})}
    resize();const o=new ResizeObserver(resize);o.observe(board.current!);return()=>o.disconnect()
  },[doc.width,doc.height])
  useEffect(()=>{
    const revision=++renderRevision.current,offscreen=document.createElement('canvas')
    void renderDrawing(doc,offscreen,images.current).then(()=>{if(life.current&&revision===renderRevision.current&&canvas.current){const c=canvas.current; c.width=doc.width;c.height=doc.height;c.getContext('2d')?.drawImage(offscreen,0,0)}}).catch(e=>{if(life.current)setError(String(e))})
  },[doc])
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if(e.type==='keyup'&&e.code==='Space'){space.current=false;return}
      if(busy||gesture.current)return
      if(e.target instanceof Element&&e.target.closest('input,textarea,select,button,a,[contenteditable]'))return
      if(e.code==='Space'){e.preventDefault();space.current=true}
      if(e.type==='keydown'&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo()}
      if(e.type==='keydown'&&e.key==='Delete'&&selected){e.preventDefault();const current=latest.current;pushHistory(current);setDoc({...current,layers:current.layers.map(l=>l.locked?l:{...l,objects:l.objects.filter(o=>o.id!==selected)})});setSelected(undefined)}
    }
    const blur=()=>{space.current=false}
    document.addEventListener('keydown',handler);document.addEventListener('keyup',handler);window.addEventListener('blur',blur)
    return()=>{document.removeEventListener('keydown',handler);document.removeEventListener('keyup',handler);window.removeEventListener('blur',blur)}
  },[selected,busy])
  const run=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await fn()}catch(e){if(life.current)setError(e instanceof Error?e.message:String(e))}finally{if(life.current)setBusy(false)}}
  const documentPoint=(e:PointerEvent)=>{const p=imagePoint(e.clientX,e.clientY,surface.current!.getBoundingClientRect());return{x:p.x*doc.width,y:p.y*doc.height}}
  const pointerDown=(e:PointerEvent<HTMLDivElement>)=>{
    if(e.button!==0||busy)return
    if(!space.current&&tool!=='pan'&&!insideImage(e.clientX,e.clientY,surface.current!.getBoundingClientRect()))return
    e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);const p=documentPoint(e),before=structuredClone(doc)
    const g:NonNullable<typeof gesture.current>={id:e.pointerId,start:p,client:{x:e.clientX,y:e.clientY},before,pan,kind:space.current||tool==='pan'?'pan':tool==='object-eraser'?'erase':tool==='select'?'move':'draw'}
    gesture.current=g
    if(g.kind==='pan')return
    if(activeLayer.locked||!activeLayer.visible){gesture.current=undefined;return}
    if(g.kind==='move'||g.kind==='erase'){
      const hit=[...activeLayer.objects].reverse().find(o=>hitObject(o,p));setSelected(hit?.id)
      if(hit){g.move=hit.id;if(g.kind==='erase')setDoc({...doc,layers:doc.layers.map(l=>l.id===activeLayer.id?{...l,objects:l.objects.filter(o=>o.id!==hit.id)}:l)})}return
    }
    const o:DrawingObject={id:crypto.randomUUID(),kind:tool,points:[p],color,width:tool==='text'?Math.max(16,width*3):width,opacity:tool==='highlighter'?opacity*.3:opacity,x:0,y:0,scale:1}
    if(tool==='text'){if(!text.trim()){gesture.current=undefined;return}o.text=text}
    g.object=o;setDoc({...doc,layers:doc.layers.map(l=>l.id===activeLayer.id?{...l,objects:[...l.objects,o]}:l)})
  }
  const pointerMove=(e:PointerEvent<HTMLDivElement>)=>{
    const g=gesture.current;if(!g||g.id!==e.pointerId)return
    if(g.kind==='pan'){setPan({x:g.pan.x+e.clientX-g.client.x,y:g.pan.y+e.clientY-g.client.y});return}
    const p=documentPoint(e)
    if(g.kind==='move'&&g.move){setDoc({...g.before,layers:g.before.layers.map(l=>l.id===activeLayer.id?{...l,objects:l.objects.map(o=>o.id===g.move?{...o,x:o.x+p.x-g.start.x,y:o.y+p.y-g.start.y}:o)}:l)});return}
    if(g.kind==='erase'){setDoc(current=>({...current,layers:current.layers.map(l=>l.id===activeLayer.id?{...l,objects:l.objects.filter(o=>!hitObject(o,p))}:l)}));return}
    if(!g.object||g.object.kind==='text')return
    const free=['pen','pencil','highlighter','eraser'].includes(g.object.kind)
    if(g.object.points.length>12000)return
    if(free)g.object={...g.object,points:[...g.object.points,p]}
    else if(g.object.kind==='curve')g.object={...g.object,points:[g.start,{x:(g.start.x+p.x)/2,y:g.start.y},p]}
    else g.object={...g.object,points:[g.start,p]}
    const object=g.object
    setDoc({...g.before,layers:g.before.layers.map(l=>l.id===activeLayer.id?{...l,objects:[...l.objects,object]}:l)})
  }
  const pointerUp=(e:PointerEvent)=>{
    const g=gesture.current;if(!g||g.id!==e.pointerId)return;gesture.current=undefined
    if(g.kind==='pan')return
    if(g.object&&['pen','pencil','highlighter'].includes(g.object.kind)){const object={...g.object,points:smoothPoints(g.object.points,smooth)};setDoc(current=>({...current,layers:current.layers.map(l=>({...l,objects:l.objects.map(o=>o.id===object.id?object:o)}))}))}
    if(g.object||g.move||g.kind==='erase')pushHistory(g.before)
  }
  const importImage=async(file:File)=>{
    const o=await imageFile(file);o.scale=Math.min(doc.width/o.imageWidth!,doc.height/o.imageHeight!,1);o.x=(doc.width-o.imageWidth!*o.scale)/2;o.y=(doc.height-o.imageHeight!*o.scale)/2
    if(doc.layers.length>=30)throw new Error(t('studioLayerLimit'))
    const id=crypto.randomUUID()
    commit({...doc,layers:[...doc.layers,{id,name:file.name.slice(0,100),visible:true,locked:false,objects:[o]}]});setLayerId(id);setSelected(o.id);setTool('select');setLayersOpen(true)
  }
  useEffect(()=>{
    if(!src||latest.current.layers.some(l=>l.objects.length))return
    const controller=new AbortController();let active=true
    setBusy(true)
    void (async()=>{
      try{const response=await fetch(src,{signal:controller.signal});if(!response.ok)throw new Error('Image unavailable');const object=await imageFile(new File([await response.blob()],'source.png',{type:'image/png'}));if(!active)return
        const d=latest.current;if(d.layers.length>=30)throw new Error(t('studioLayerLimit'));object.scale=Math.min(d.width/object.imageWidth!,d.height/object.imageHeight!,1);object.x=(d.width-object.imageWidth!*object.scale)/2;object.y=(d.height-object.imageHeight!*object.scale)/2
        const id=crypto.randomUUID();commit({...d,layers:[...d.layers,{id,name:t('studioSource'),visible:true,locked:false,objects:[object]}]});setLayerId(id)
      }catch(e){if(active)setError(String(e))}finally{if(active)setBusy(false)}
    })()
    return()=>{active=false;controller.abort()}
  },[src])
  const exportPng=async()=>{const out=document.createElement('canvas');await renderDrawing(latest.current,out,images.current);return canvasPng(out)}
  const save=()=>{try{const id=draftId??crypto.randomUUID();const next=saveDrawing(localStorage,{id,name:(draftName.trim()||t('studioSketch')).slice(0,100),updated:Date.now(),document:doc});setDrafts(next);setDraftId(id);setDirty(false);setStatus(t('studioSaved'))}catch(e){setError(String(e))}}
  const changeObject=(patch:Partial<DrawingObject>)=>{if(selectedObject&&!activeLayer.locked)mutateLayer(l=>({...l,objects:l.objects.map(o=>o.id===selected?{...o,...patch}:o)}))}
  const bounds=selectedObject?objectBounds(selectedObject):undefined
  return <StudioDialog title={t('studioSketch')} sketch onClose={onClose} busy={busy}>
    <header className={css.sketchHeader}><strong>{t('studioSketch')}{dirty?' •':''}</strong>
      <div className={css.pill}><button type="button" className={css.tool} title={t('studioUndo')} aria-label={t('studioUndo')} disabled={!history.current.length} onClick={undo}><StudioIcon name="undo"/></button><button type="button" className={css.tool} title={t('studioRedo')} aria-label={t('studioRedo')} disabled={!future.current.length} onClick={redo}><StudioIcon name="redo"/></button></div>
      <button type="button" className={css.tool} aria-pressed={filesOpen} onClick={()=>setFilesOpen(v=>!v)}>{t('studioDrafts')}</button>
      <button type="button" className={css.tool} aria-pressed={layersOpen} onClick={()=>setLayersOpen(v=>!v)}><StudioIcon name="layer"/>{t('studioLayers')} {doc.layers.length}</button>
      <select aria-label={t('studioRatio')} value={`${doc.width}:${doc.height}`} onChange={e=>{const[w,h]=e.target.value.split(':').map(Number);commit({...doc,width:w!,height:h!});fit()}}><option value={`${doc.width}:${doc.height}`}>{doc.width} × {doc.height}</option>{[[1024,1024],[768,1024],[576,1024],[1024,768],[1024,576]].map(([w,h])=><option key={`${w}:${h}`} value={`${w}:${h}`}>{w} × {h}</option>)}</select>
      <button type="button" className={css.tool} aria-label={t('studioZoomOut')} onClick={()=>setZoom(z=>clamp(z/1.2,.25,8))}>−</button><button type="button" className={css.tool} onClick={fit}>{Math.round(zoom*fitSize.w/doc.width*100)}%</button><button type="button" className={css.tool} aria-label={t('studioZoomIn')} onClick={()=>setZoom(z=>clamp(z*1.2,.25,8))}>+</button>
      <button type="button" className={css.primary} disabled={busy} onClick={()=>void run(async()=>{const file=await exportPng();await onAttach(file,doc.width,doc.height);if(life.current)setStatus(t('studioAttached'))})}>{t(busy?'studioPending':'studioAttach')}</button>
    </header><button type="button" className={css.close} aria-label={t('studioClose')} onClick={onClose}><StudioIcon name="close"/></button>
    <div ref={board} tabIndex={0} aria-label={t('studioSketch')} className={css.board} style={{cursor:tool==='pan'?'grab':'crosshair'}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{const g=gesture.current;if(g&&g.kind!=='pan')setDoc(g.before);gesture.current=undefined}}
      onWheel={e=>{e.preventDefault();setZoom(z=>clamp(z*Math.exp(-e.deltaY*.001),.25,8))}}>
      <div ref={surface} className={css.boardSurface} style={{width:fitSize.w,height:fitSize.h,transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}><canvas ref={canvas}/>{bounds&&<span className={css.selection} style={{left:bounds.x/doc.width*100+'%',top:bounds.y/doc.height*100+'%',width:bounds.width/doc.width*100+'%',height:bounds.height/doc.height*100+'%'}}/>}</div>
      {layersOpen&&<aside className={css.layers} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}><header><strong>{t('studioLayers')}</strong><button type="button" className={css.tool} aria-label={t('studioAddLayer')} disabled={doc.layers.length>=30} onClick={()=>{const id=crypto.randomUUID();commit({...doc,layers:[...doc.layers,{id,name:String(doc.layers.length+1),visible:true,locked:false,objects:[]}]});setLayerId(id)}}>+</button></header>
        {[...doc.layers].reverse().map(l=><div className={css.layerRow} data-active={l.id===activeLayer.id} key={l.id}><input type="checkbox" aria-label={`${t('studioVisible')} ${l.name}`} checked={l.visible} onChange={e=>commit({...doc,layers:doc.layers.map(a=>a.id===l.id?{...a,visible:e.target.checked}:a)})}/><button type="button" className={css.tool} onClick={()=>{setLayerId(l.id);setSelected(undefined)}}>{l.name} ({l.objects.length})</button></div>)}
        <label>{t('studioRename')}<input aria-label={t('studioRename')} maxLength={100} value={activeLayer.name} onChange={e=>mutateLayer(l=>({...l,name:e.target.value}))}/></label>
        <label><input type="checkbox" checked={activeLayer.locked} onChange={e=>mutateLayer(l=>({...l,locked:e.target.checked}))}/>{t('studioLock')}</label>
        <div className={css.layerActions}>{[-1,1].map(delta=><button type="button" key={delta} className={css.tool} onClick={()=>{const list=[...doc.layers],i=list.findIndex(l=>l.id===activeLayer.id),j=clamp(i+delta,0,list.length-1);[list[i],list[j]]=[list[j]!,list[i]!];commit({...doc,layers:list})}}>{t(delta===1?'studioUp':'studioDown')}</button>)}<button type="button" className={css.tool} disabled={doc.layers.length>=30} onClick={()=>commit({...doc,layers:[...doc.layers,{...structuredClone(activeLayer),id:crypto.randomUUID(),objects:activeLayer.objects.map(o=>({...structuredClone(o),id:crypto.randomUUID()}))}]})}>{t('studioDuplicate')}</button><button type="button" className={css.tool} disabled={doc.layers.length===1} onClick={()=>{commit({...doc,layers:doc.layers.filter(l=>l.id!==activeLayer.id)});setLayerId('');setSelected(undefined)}}>{t('studioDelete')}</button></div>
        <button type="button" className={css.tool} disabled={activeLayer.locked||!activeLayer.objects.length} onClick={()=>{mutateLayer(l=>({...l,objects:[]}));setSelected(undefined)}}>{t('studioClearLayer')}</button>
        {selectedObject&&<div className={css.properties}><strong>{t('studioSelect')}</strong><label>{t('studioScale')}<input type="range" min=".1" max="3" step=".05" value={selectedObject.scale} onChange={e=>changeObject({scale:Number(e.target.value)})}/></label><label>{t('studioColor')}<input type="color" value={selectedObject.color} onChange={e=>changeObject({color:e.target.value})}/></label>{selectedObject.kind==='text'&&<input aria-label={t('studioTextValue')} value={selectedObject.text??''} onChange={e=>changeObject({text:e.target.value.slice(0,1000)})}/>}{selectedObject.kind==='curve'&&<><label>{t('studioControlX')}<input type="range" min="0" max={doc.width} value={selectedObject.points[1]?.x??0} onChange={e=>changeObject({points:selectedObject.points.map((p,i)=>i===1?{...p,x:Number(e.target.value)}:p)})}/></label><label>{t('studioControlY')}<input type="range" min="0" max={doc.height} value={selectedObject.points[1]?.y??0} onChange={e=>changeObject({points:selectedObject.points.map((p,i)=>i===1?{...p,y:Number(e.target.value)}:p)})}/></label></> }<button type="button" className={css.tool} onClick={()=>{mutateLayer(l=>({...l,objects:l.objects.filter(o=>o.id!==selected)}));setSelected(undefined)}}>{t('studioDelete')}</button></div>}
      </aside>}
      {filesOpen&&<aside className={css.files} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
        <button type="button" className={css.tool} onClick={()=>replace(newDrawing())}>{t('studioNew')}</button>
        <input aria-label={t('studioDraftName')} maxLength={100} placeholder={t('studioDraftName')} value={draftName} onChange={e=>setDraftName(e.target.value)}/><button type="button" className={css.tool} onClick={save}>{t('studioSave')}</button>
        <button type="button" className={css.tool} onClick={()=>input.current?.click()}>{t('studioImport')}</button>
        <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp,application/json,.json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>{if(file.size>16*1024*1024)throw new Error('File too large');if(file.name.endsWith('.json'))replace(decodeDrawing(JSON.parse(await file.text())));else await importImage(file)})}}/>
        {src&&<button type="button" className={css.tool} onClick={()=>void run(async()=>{const r=await fetch(src);if(!r.ok)throw new Error('Image unavailable');await importImage(new File([await r.blob()],'source.png',{type:'image/png'}))})}>{t('studioSource')}</button>}
        <button type="button" className={css.tool} onClick={()=>void run(async()=>downloadBlob(await exportPng(),'codex-sketch.png'))}>{t('studioExport')}</button>
        <button type="button" className={css.tool} onClick={()=>{try{downloadBlob(new Blob([JSON.stringify(decodeDrawing(doc))],{type:'application/json'}),'codex-sketch.json')}catch(e){setError(String(e))}}}>{t('studioExportDraft')}</button>
        <label>{t('studioBackground')}<select value={doc.background} onChange={e=>commit({...doc,background:e.target.value})}><option value="#ffffff">{t('studioWhite')}</option><option value="transparent">{t('studioTransparent')}</option></select></label>
        <small>{t('studioStorage')}</small>{!drafts.length&&<small>{t('studioNoDrafts')}</small>}{drafts.map(d=><div className={css.draftRow} key={d.id}><button type="button" className={css.tool} title={new Date(d.updated).toLocaleString()} onClick={()=>replace(d.document,d.id,d.name)}>{d.name}</button><button type="button" className={css.tool} aria-label={`${t('studioDelete')} ${d.name}`} onClick={()=>{try{const next=drafts.filter(a=>a.id!==d.id);localStorage.setItem(DRAWING_STORAGE,JSON.stringify(next));setDrafts(next)}catch(e){setError(String(e))}}}><StudioIcon name="close"/></button></div>)}
      </aside>}
    </div>
    <div className={css.controls} role="toolbar" aria-label={t('studioSketch')}>{(Object.keys(toolKeys) as DrawTool[]).map(key=><button type="button" key={key} aria-pressed={tool===key} onClick={()=>{setTool(key);if(key==='select')setLayersOpen(true)}}><StudioIcon name={key==='object-eraser'?'eraser':key}/>{t(toolKeys[key])}</button>)}
      <label>{t('studioColor')}<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label>{t('studioBrushSize')}<input type="range" min="1" max="100" value={width} onChange={e=>setWidth(Number(e.target.value))}/>{width}</label>
      <label>{t('studioOpacity')}<input type="range" min=".05" max="1" step=".05" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label><label>{t('studioSmooth')}<input type="range" min="0" max=".9" step=".1" value={smooth} onChange={e=>setSmooth(Number(e.target.value))}/></label>
      {tool==='text'&&<input aria-label={t('studioTextValue')} maxLength={1000} value={text} onChange={e=>setText(e.target.value)} placeholder={t('studioTextValue')}/>}
    </div><p className={css.status} role={error?'alert':'status'}>{error||status||t('studioHelp')}</p>
  </StudioDialog>
}
