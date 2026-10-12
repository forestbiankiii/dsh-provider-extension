/** Theme-matched dropdown; native popover keeps the list above scrolling panels. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import css from './ProviderSettings.module.css'
interface Props { label: string; value: string; choices: readonly string[]; labels: readonly string[]; disabled?: boolean; onChange(value: string): void }
export function SettingsDropdown({ label, value, choices, labels, disabled, onChange }: Props) {
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus() }
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return
    const list = menu.current, rect = trigger.current.getBoundingClientRect()
    const width = Math.min(Math.max(rect.width, 150), window.innerWidth - 16)
    const height = Math.min(choices.length * 36 + 12, window.innerHeight - 16)
    const below = window.innerHeight - rect.bottom - 8
    Object.assign(list.style, { width: `${width}px`, left: `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`, top: `${Math.max(8, below >= height ? rect.bottom + 4 : rect.top - height - 4)}px`, maxHeight: `${height}px` })
    list.setAttribute('popover', 'manual')
    list.showPopover?.()
    list.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
    return () => { list.hidePopover?.() }
  }, [open, choices.length])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close() }
    const scroll = (event: Event) => { const target = event.target; if (!(target instanceof Node) || !menu.current?.contains(target)) close() }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('scroll', scroll, true); window.addEventListener('resize', scroll)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll) }
  }, [open])
  return <div className={css.settingDropdown} ref={root}>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-controls={id} aria-expanded={open}
      value={value} aria-valuetext={labels[choices.indexOf(value)] ?? value} disabled={disabled} className={css.settingTrigger} onClick={() => setOpen(previous => !previous)}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true) } }}>
      {labels[choices.indexOf(value)] ?? value}<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && !disabled && <div ref={menu} id={id} role="listbox" aria-label={label} className={css.settingMenu}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
        if (event.key === 'Tab') { close(true); return }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
      }}>
      {choices.map((choice, index) => <button key={choice} type="button" role="option" aria-selected={choice === value} className={css.settingOption}
        onClick={() => { close(true); if (choice !== value) onChange(choice) }}>
        {labels[index]}<span aria-hidden="true">{choice === value ? '✓' : ''}</span>
      </button>)}
    </div>}
  </div>
}
