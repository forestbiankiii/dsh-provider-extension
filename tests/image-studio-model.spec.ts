// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { decodeDrawing, DRAWING_STORAGE, hitObject, imagePoint, loadDrawings, newDrawing, saveDrawing, smoothPoints, objectBounds, insideImage, type DrawingObject } from '../src/client/image-studio-model.ts'
const object:DrawingObject={id:'pen1',kind:'pen',points:[{x:10,y:10},{x:20,y:30}],color:'#000000',width:4,opacity:1,x:0,y:0,scale:1}
describe('Image studio vector model and local drafts',()=>{
  it('maps transformed screen bounds into normalized image coordinates',()=>{
    expect(imagePoint(125,175,{left:25,top:75,width:200,height:200})).toEqual({x:.5,y:.5})
    expect(imagePoint(-1,999,{left:25,top:75,width:200,height:200})).toEqual({x:0,y:1})
    expect(()=>imagePoint(1,1,{left:0,top:0,width:0,height:2})).toThrow()
  })
  it('rejects margin editing and handles long imported strokes without argument spreading',()=>{
    expect(insideImage(-1,50,{left:0,top:0,width:100,height:100})).toBe(false)
    const long={...object,points:Array.from({length:150000},(_,i)=>({x:i%100,y:i%150}))}
    expect(objectBounds(long)).toEqual({x:0,y:0,width:99,height:149})
    const diagonal={...object,points:[{x:0,y:0},{x:100,y:100}]}
    expect(hitObject(diagonal,{x:80,y:20})).toBe(false)
    expect(hitObject(diagonal,{x:80,y:80})).toBe(true)
  })
  it('validates editable documents and rejects remote / scripted image references',()=>{
    const d=newDrawing();d.layers[0]!.objects=[object]
    expect(decodeDrawing(JSON.parse(JSON.stringify(d)))).toEqual(d)
    expect(()=>decodeDrawing({...d,width:99999})).toThrow()
    expect(()=>decodeDrawing({...d,layers:[{...d.layers[0],objects:[{...object,kind:'image',data:'https://example.com/a.png',imageWidth:100,imageHeight:100}]}]})).toThrow()
    expect(()=>decodeDrawing({...d,layers:[{...d.layers[0],objects:[{...object,points:[{x:NaN,y:0}]}]}]})).toThrow()
  })
  it('retains editable objects across a new storage reader and refuses a 21st draft',()=>{
    const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v)}}
    const d=newDrawing();d.layers[0]!.objects=[object]
    saveDrawing(storage,{id:'a',name:'A',updated:1,document:d})
    expect(loadDrawings(storage)[0]?.document.layers[0]?.objects).toEqual([object])
    for(let i=1;i<20;i++)saveDrawing(storage,{id:String(i),name:String(i),updated:i,document:newDrawing()})
    expect(()=>saveDrawing(storage,{id:'new',name:'New',updated:21,document:newDrawing()})).toThrow('20')
    expect(loadDrawings(storage)).toHaveLength(20)
    storage.setItem(DRAWING_STORAGE,'not JSON');expect(loadDrawings(storage)).toEqual([])
  })
  it('smooths stroke interiors without moving endpoints and respects object transforms',()=>{
    const points=[{x:0,y:0},{x:10,y:30},{x:20,y:0}]
    expect(smoothPoints(points,.5)).toEqual([{x:0,y:0},{x:10,y:15},{x:20,y:0}])
    expect(hitObject({...object,x:100,y:100,scale:2},{x:125,y:140})).toBe(true)
    expect(hitObject({...object,kind:'eraser'},{x:15,y:15})).toBe(false)
  })
})
