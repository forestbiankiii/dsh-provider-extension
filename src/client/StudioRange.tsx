import type { CSSProperties } from 'react'
import css from './ImageStudio.module.css'

/** Keep native range semantics and keyboard behavior; only presentation is shared. */
export function StudioRange({label,min,max,step=1,value,valueText=String(value),onChange}:{
  label:string;min:number;max:number;step?:number;value:number;valueText?:string;onChange:(value:number)=>void
}){
  const fill=Math.max(0,Math.min(100,(value-min)/(max-min)*100))
  return <span className={css.rangeControl}>
    <input className={css.rangeInput} type="range" aria-label={label} aria-valuetext={valueText}
      min={min} max={max} step={step} value={value}
      style={{'--studio-range-fill':`${fill}%`} as CSSProperties}
      onChange={event=>onChange(Number(event.target.value))}/>
    <output className={css.rangeValue} title={valueText} aria-hidden="true">{valueText}</output>
  </span>
}
