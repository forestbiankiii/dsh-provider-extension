import { useEffect, useRef, type ReactNode } from 'react'
import css from './ImageStudio.module.css'

/** Native top-layer dialog supplies focus trapping, inert background and Escape. */
export function StudioDialog({ title, children, onClose, sketch = false, busy = false }: { title: string; children: ReactNode; onClose: () => void; sketch?: boolean; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const dialog=ref.current!, opener=document.activeElement
    dialog.showModal()
    return () => { dialog.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus() }
  }, [])
  return <dialog ref={ref} aria-label={title} aria-busy={busy} className={sketch ? css.sketchDialog : css.viewerDialog}
    onCancel={event=>{event.preventDefault();if(!busy)closeRef.current()}}><fieldset disabled={busy} style={{display:'contents',border:0,padding:0,margin:0}}>{children}</fieldset></dialog>
}
export function StudioIcon({ name }: { name: string }) {
  const paths: Record<string,string> = {
    line:'M5 19L19 5', arrow:'M4 20L20 4M11 4h9v9',rectangle:'M4 5h16v14H4z',ellipse:'M20 12a8 6 0 11-16 0 8 6 0 1116 0',curve:'M4 18Q12 0 20 18',text:'M4 5h16M12 5v15M8 20h8',pencil:'M4 20l2-6L16 4l4 4-10 10-6 2M5 17l2 2M13 7l4 4',highlighter:'M3 20h12M6 16l8-12 6 4-8 12-6-4M8 13l7 4',eraser:'M3 14l9-10 8 7-8 10H8l-5-7M8 9l8 8M14 21h7',
    close:'M6 6l12 12M18 6L6 18', mark:'M4 4h16v12H9l-5 4V4', pan:'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
    pen:'M4 20l3-7L17 3l4 4-10 10-7 3M14 6l4 4', erase:'M3 14l9-10 8 7-8 10H8l-5-7M8 9l8 8M14 21h7', download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5', background:'M3 4h18v16H3zM4 16l5-6 4 4 3-3 5 5M7 7h1', ratio:'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', undo:'M4 11l5-5M4 11l5 5M4 11h10a6 6 0 010 12', redo:'M20 11l-5-5M20 11l-5 5M20 11H10a6 6 0 000 12', select:'M4 3l15 9-7 2-4 7-4-18', layer:'M3 8l9-5 9 5-9 5-9-5M3 12l9 5 9-5M3 16l9 5 9-5',
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]??paths.pen} /></svg>
}
