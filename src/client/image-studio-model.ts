export type Point = { x: number; y: number }
export type DrawTool = 'select' | 'pan' | 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'object-eraser' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'curve' | 'text'
export interface DrawingObject {
  id: string; kind: DrawTool | 'image'; points: Point[]; color: string; width: number; opacity: number
  x: number; y: number; scale: number; text?: string; data?: string; imageWidth?: number; imageHeight?: number
}
export interface DrawingLayer { id: string; name: string; visible: boolean; locked: boolean; objects: DrawingObject[] }
export interface DrawingDocument { version: 1; width: number; height: number; background: string; layers: DrawingLayer[] }
export interface SavedDrawing { id: string; name: string; updated: number; document: DrawingDocument }
export const newDrawing = (): DrawingDocument => ({ version: 1, width: 1024, height: 1024, background: '#ffffff', layers: [{ id: crypto.randomUUID(), name: '1', visible: true, locked: false, objects: [] }] })
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
export function imagePoint(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Point {
  if (rect.width <= 0 || rect.height <= 0) throw new Error('Image geometry unavailable')
  return { x: clamp((clientX - rect.left) / rect.width, 0, 1), y: clamp((clientY - rect.top) / rect.height, 0, 1) }
}
export function smoothPoints(points: Point[], amount: number): Point[] {
  if (points.length < 3 || amount === 0) return points
  return points.map((p, i) => i === 0 || i === points.length - 1 ? p : {
    x: p.x * (1 - amount) + ((points[i - 1]!.x + points[i + 1]!.x) / 2) * amount,
    y: p.y * (1 - amount) + ((points[i - 1]!.y + points[i + 1]!.y) / 2) * amount,
  })
}
export function insideImage(x:number,y:number,rect:Pick<DOMRect,'left'|'top'|'width'|'height'>):boolean {
  return rect.width>0&&rect.height>0&&x>=rect.left&&x<=rect.left+rect.width&&y>=rect.top&&y<=rect.top+rect.height
}
export function objectBounds(o: DrawingObject) {
  if (o.kind === 'image') return { x: o.x, y: o.y, width: (o.imageWidth ?? 1) * o.scale, height: (o.imageHeight ?? 1) * o.scale }
  const first=o.points[0]??{x:0,y:0}
  if (o.kind === 'text') return { x: o.x + first.x * o.scale, y: o.y + first.y * o.scale - o.width * o.scale, width: Math.max(o.width, (o.text?.length ?? 1) * o.width * 0.65) * o.scale, height: o.width * 1.4 * o.scale }
  let minX=first.x,maxX=first.x,minY=first.y,maxY=first.y
  for(const p of o.points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)}
  return { x: o.x + minX * o.scale, y: o.y + minY * o.scale, width: Math.max(1, maxX-minX) * o.scale, height: Math.max(1, maxY-minY) * o.scale }
}
function segmentDistance(p:Point,a:Point,b:Point){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length,0,1):0
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)
}
export function hitObject(o: DrawingObject, p: Point): boolean {
  if (o.kind === 'eraser') return false
  const b = objectBounds(o), margin = Math.max(6, o.width * o.scale / 2)
  if(!(p.x >= b.x-margin && p.x <= b.x+b.width+margin && p.y >= b.y-margin && p.y <= b.y+b.height+margin))return false
  if(o.kind==='image'||o.kind==='text')return true
  const q={x:(p.x-o.x)/o.scale,y:(p.y-o.y)/o.scale},radius=margin/o.scale,a=o.points[0]!,z=o.points.at(-1)!
  let points=o.points
  if(o.kind==='rectangle')points=[a,{x:z.x,y:a.y},z,{x:a.x,y:z.y},a]
  if(o.kind==='ellipse'){
    const rx=Math.abs(z.x-a.x)/2,ry=Math.abs(z.y-a.y)/2
    if(!rx||!ry)return segmentDistance(q,a,z)<=radius
    const normalized=Math.hypot((q.x-(a.x+z.x)/2)/rx,(q.y-(a.y+z.y)/2)/ry)
    return Math.abs(normalized-1)*Math.min(rx,ry)<=radius
  }
  if(o.kind==='curve'){
    const m=o.points[1]??a;points=Array.from({length:25},(_,i)=>{const t=i/24;return{x:(1-t)**2*a.x+2*(1-t)*t*m.x+t*t*z.x,y:(1-t)**2*a.y+2*(1-t)*t*m.y+t*t*z.y}})
  }
  if(points.length===1)return Math.hypot(q.x-a.x,q.y-a.y)<=radius
  for(let i=1;i<points.length;i++)if(segmentDistance(q,points[i-1]!,points[i]!)<=radius)return true
  return false
}
export function decodeDrawing(value: unknown): DrawingDocument {
  const d = value as DrawingDocument
  if (!d || d.version !== 1 || !Number.isSafeInteger(d.width) || !Number.isSafeInteger(d.height) || d.width < 64 || d.height < 64 || d.width > 4096 || d.height > 4096
    || !/^#[0-9a-f]{6}$/i.test(d.background) && d.background !== 'transparent' || !Array.isArray(d.layers) || d.layers.length < 1 || d.layers.length > 30) throw new Error('Invalid drawing document')
  let count = 0, pointCount = 0, dataBytes = 0
  const ids = new Set<string>()
  for (const layer of d.layers) {
    if (!layer || typeof layer.id !== 'string' || ids.has(layer.id) || typeof layer.name !== 'string' || layer.name.length > 100 || typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean' || !Array.isArray(layer.objects)) throw new Error('Invalid layer')
    ids.add(layer.id)
    for (const o of layer.objects) {
      if (!o || typeof o.id !== 'string' || ids.has(o.id) || !['pen','pencil','highlighter','eraser','line','arrow','rectangle','ellipse','curve','text','image'].includes(o.kind)
        || !/^#[0-9a-f]{6}$/i.test(o.color) || ![o.width, o.opacity, o.x, o.y, o.scale].every(Number.isFinite) || o.width < 1 || o.width > 300 || o.opacity < 0 || o.opacity > 1 || o.scale < 0.01 || o.scale > 100
        || !Array.isArray(o.points) || o.points.length < 1 || !o.points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 16384 && Math.abs(p.y) <= 16384)
        || Math.abs(o.x) > 16384 || Math.abs(o.y) > 16384 || o.text !== undefined && (typeof o.text !== 'string' || o.text.length > 1000)) throw new Error('Invalid drawing object')
      ids.add(o.id); count++; pointCount += o.points.length
      if (o.kind === 'image') {
        if (typeof o.data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(o.data) || !Number.isSafeInteger(o.imageWidth) || !Number.isSafeInteger(o.imageHeight) || o.imageWidth! < 1 || o.imageHeight! < 1 || o.imageWidth! > 4096 || o.imageHeight! > 4096) throw new Error('Invalid embedded image')
        dataBytes += o.data.length
      }
      if (count > 2000 || pointCount > 200000 || dataBytes > 12 * 1024 * 1024) throw new Error('Drawing exceeds limits')
    }
  }
  return structuredClone(d)
}
function pathObject(c: CanvasRenderingContext2D, o: DrawingObject) {
  const a = o.points[0]!, b = o.points.at(-1)!
  c.beginPath()
  if (o.kind === 'rectangle') c.rect(Math.min(a.x,b.x), Math.min(a.y,b.y), Math.abs(b.x-a.x), Math.abs(b.y-a.y))
  else if (o.kind === 'ellipse') c.ellipse((a.x+b.x)/2, (a.y+b.y)/2, Math.abs(b.x-a.x)/2, Math.abs(b.y-a.y)/2, 0, 0, Math.PI*2)
  else if (o.kind === 'curve') { const mid = o.points[1] ?? a; c.moveTo(a.x,a.y); c.quadraticCurveTo(mid.x,mid.y,b.x,b.y) }
  else { c.moveTo(a.x,a.y); for (const p of o.points.slice(1)) c.lineTo(p.x,p.y) }
  c.stroke()
  if (o.points.length === 1) { c.beginPath(); c.arc(a.x,a.y,o.width/2,0,Math.PI*2); c.fill() }
  if (o.kind === 'arrow') {
    const angle = Math.atan2(b.y-a.y,b.x-a.x), len = Math.max(12,o.width*3)
    c.beginPath(); c.moveTo(b.x-len*Math.cos(angle-0.5),b.y-len*Math.sin(angle-0.5)); c.lineTo(b.x,b.y); c.lineTo(b.x-len*Math.cos(angle+0.5),b.y-len*Math.sin(angle+0.5)); c.stroke()
  }
}
export async function renderDrawing(d: DrawingDocument, canvas: HTMLCanvasElement, images: Map<string, HTMLImageElement> = new Map()): Promise<void> {
  canvas.width = d.width; canvas.height = d.height
  const c = canvas.getContext('2d'); if (!c) throw new Error('Canvas unavailable')
  c.clearRect(0,0,d.width,d.height)
  if (d.background !== 'transparent') { c.fillStyle = d.background; c.fillRect(0,0,d.width,d.height) }
  for (const layer of d.layers) {
    if (!layer.visible) continue
    const surface = document.createElement('canvas'); surface.width=d.width; surface.height=d.height
    const lc = surface.getContext('2d'); if (!lc) throw new Error('Canvas unavailable')
    for (const o of layer.objects) {
      lc.save(); lc.translate(o.x,o.y); lc.scale(o.scale,o.scale); lc.globalAlpha = o.opacity
      lc.lineCap='round'; lc.lineJoin='round'; lc.strokeStyle=o.color; lc.fillStyle=o.color; lc.lineWidth=o.width
      if (o.kind === 'eraser') lc.globalCompositeOperation = 'destination-out'
      if (o.kind === 'image' && o.data) {
        let img = images.get(o.data)
        if (!img) { img = new Image(); img.src = o.data; await img.decode(); images.set(o.data,img) }
        lc.drawImage(img,0,0,o.imageWidth!,o.imageHeight!)
      } else if (o.kind === 'text') { lc.font=`${o.width}px sans-serif`; lc.fillText(o.text ?? '',o.points[0]!.x,o.points[0]!.y) }
      else {
        if (o.kind === 'pencil') { lc.globalAlpha *= 0.7; lc.setLineDash([Math.max(1,o.width*0.3), Math.max(0.5,o.width*0.12)]) }
        pathObject(lc,o)
      }
      lc.restore()
    }
    c.drawImage(surface,0,0)
    surface.width=1;surface.height=1
  }
}
export function canvasPng(canvas: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(new File([blob],'codex-sketch.png',{type:'image/png'})) : reject(new Error('PNG encoding failed')),'image/png'))
}
export async function imageFile(file: File): Promise<DrawingObject> {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12*1024*1024) throw new Error('Import a PNG, JPEG or WebP smaller than 12 MB')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1,2048/bitmap.width,2048/bitmap.height), canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale))
    const c=canvas.getContext('2d'); if (!c) throw new Error('Canvas unavailable'); c.drawImage(bitmap,0,0,canvas.width,canvas.height)
    return { id:crypto.randomUUID(),kind:'image',points:[{x:0,y:0}],color:'#000000',width:1,opacity:1,x:0,y:0,scale:1,data:canvas.toDataURL('image/png'),imageWidth:canvas.width,imageHeight:canvas.height }
  } finally { bitmap.close() }
}
export function downloadBlob(blob: Blob, name: string) {
  const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name; a.click()
  // Keep the URL alive until the browser has accepted the download.
  setTimeout(()=>URL.revokeObjectURL(url),60000)
}
export const DRAWING_STORAGE = 'dpe:sketch-drafts:v1'
export function loadDrawings(storage: Pick<Storage,'getItem'>): SavedDrawing[] {
  try {
    const value=JSON.parse(storage.getItem(DRAWING_STORAGE)??'[]') as SavedDrawing[]
    if (!Array.isArray(value) || value.length>20) return []
    return value.filter(item=>typeof item.id==='string' && typeof item.name==='string' && item.name.length<=100 && Number.isFinite(item.updated)).flatMap(item=>{
      try { return [{...item,document:decodeDrawing(item.document)}] } catch { return [] }
    })
  } catch { return [] }
}
export function saveDrawing(storage: Pick<Storage,'getItem'|'setItem'>, item: SavedDrawing): SavedDrawing[] {
  const records=loadDrawings(storage).filter(d=>d.id!==item.id)
  if (records.length>=20) throw new Error('Only 20 local drawings can be saved; remove a draft first')
  const next=[{...item,document:decodeDrawing(item.document)},...records]
  storage.setItem(DRAWING_STORAGE,JSON.stringify(next)); return next
}
