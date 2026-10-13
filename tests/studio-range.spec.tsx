// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StudioRange } from '../src/client/StudioRange.tsx'
afterEach(()=>cleanup())
describe('Theme-consistent native studio sliders',()=>{
  it('retains numeric range bounds and updates fill and percentage without custom keyboard handling',()=>{
    function Harness(){const[value,setValue]=useState(1);return <StudioRange label="Opacity" min={.05} max={1} step={.05} value={value} valueText={`${Math.round(value*100)}%`} onChange={setValue}/>}
    render(<Harness/>);const slider=screen.getByRole('slider',{name:'Opacity'}) as HTMLInputElement
    expect(slider.type).toBe('range');expect(slider.min).toBe('0.05');expect(slider.max).toBe('1');expect(slider.step).toBe('0.05')
    expect(slider.getAttribute('aria-valuetext')).toBe('100%');expect(slider.style.getPropertyValue('--studio-range-fill')).toBe('100%')
    fireEvent.change(slider,{target:{value:'0.5'}})
    expect(slider.value).toBe('0.5');expect(slider.getAttribute('aria-valuetext')).toBe('50%')
    expect(parseFloat(slider.style.getPropertyValue('--studio-range-fill'))).toBeCloseTo(47.368)
    expect(slider.parentElement?.querySelector('output')?.textContent).toBe('50%')
  })
  it('shares native disabled fieldset semantics and does not change the smoothing default',()=>{
    render(<fieldset disabled><StudioRange label="Smoothing" min={0} max={.9} step={.05} value={.35} valueText="35%" onChange={()=>{}}/></fieldset>)
    const slider=screen.getByRole('slider',{name:'Smoothing'}) as HTMLInputElement
    expect(slider.value).toBe('0.35');expect(slider.matches(':disabled')).toBe(true)
    expect(slider.getAttribute('aria-valuetext')).toBe('35%')
  })
})
