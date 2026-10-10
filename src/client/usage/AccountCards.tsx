/** Display-only card preferences. Stores IDs/visibility, never balances, labels or credentials. */
import { useRef, useState, type ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageKey } from './locales.ts'
import css from './UsagePage.module.css'

export const CARD_LAYOUT_KEY = 'dsh-provider-extension:usage-card-layout'
type Layout = { version: 1; order: string[]; hidden: string[] }
export interface AccountCard { id: string; label: string; content: ReactNode }
const defaults = (): Layout => ({ version: 1, order: [], hidden: [] })
export function readCardLayout(): Layout {
  try {
    const raw = window.localStorage.getItem(CARD_LAYOUT_KEY)
    if (!raw || raw.length > 131072) return defaults()
    const value = JSON.parse(raw) as Partial<Layout>
    const ids = (entry: unknown): entry is string[] => Array.isArray(entry) && entry.length <= 1000 && entry.every(id => typeof id === 'string' && id.length > 0 && id.length <= 1024)
    if (value?.version === 1 && ids(value.order) && ids(value.hidden)) return { version: 1, order: [...new Set(value.order)], hidden: [...new Set(value.hidden)] }
  } catch {}
  return defaults()
}
export function moveCard(order: readonly string[], source: string, target: string): string[] {
  const from = order.indexOf(source), to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return [...order]
  const next = order.filter(id => id !== source)
  next.splice(to, 0, source)
  return next
}

export function AccountCards({ cards, t }: { cards: readonly AccountCard[]; t: Translate<UsageKey> }) {
  const [layout, setLayout] = useState(readCardLayout)
  const [storageError, setStorageError] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [dragged, setDragged] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const source = useRef<string | null>(null)
  const summary = useRef<HTMLElement>(null)
  const byId = new Map(cards.map(card => [card.id, card]))
  const order = [...layout.order.filter(id => byId.has(id)), ...cards.map(card => card.id).filter(id => !layout.order.includes(id))]
  const ordered = order.map(id => byId.get(id)!)
  const visible = ordered.filter(card => !layout.hidden.includes(card.id))
  const commit = (next: Layout) => {
    setLayout(next)
    try { window.localStorage.setItem(CARD_LAYOUT_KEY, JSON.stringify(next)); setStorageError(false) } catch { setStorageError(true) }
  }
  const move = (id: string, target: string) => {
    if (id === target || !byId.has(id) || !byId.has(target)) return
    const next = moveCard(order, id, target)
    commit({ ...layout, order: next })
    setAnnouncement(t('cardMoved', { name: byId.get(id)?.label ?? '', position: next.indexOf(id) + 1 }))
  }
  const visibility = (id: string, show: boolean) => commit({ ...layout, order, hidden: show ? layout.hidden.filter(key => key !== id) : [...new Set([...layout.hidden, id])] })
  const endDrag = () => { source.current = null; setDragged(null); setDropTarget(null) }
  return <>
    <details className={css.cardLayout} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; summary.current?.focus() } }}>
      <summary ref={summary}>{t('cardLayout')} <span>{t('cardsVisible', { count: visible.length, total: cards.length })}</span></summary>
      <div className={css.cardLayoutBody}>
        <p>{t('cardLayoutHint')}</p>
        <div className={css.cardChoices} role="group" aria-label={t('cardLayout')}>
          {ordered.map((card, index) => <div className={css.cardChoice} key={card.id}>
            <label><input type="checkbox" checked={!layout.hidden.includes(card.id)} onChange={event => visibility(card.id, event.target.checked)} />{card.label}</label>
            <div className={css.cardChoiceMoves}>
              <button type="button" disabled={index === 0} aria-label={t('cardMoveUp', { name: card.label })} onClick={() => { move(card.id, order[index - 1]!) }}>↑</button>
              <button type="button" disabled={index === order.length - 1} aria-label={t('cardMoveDown', { name: card.label })} onClick={() => { move(card.id, order[index + 1]!) }}>↓</button>
            </div>
          </div>)}
        </div>
        <button type="button" onClick={() => { commit(defaults()); setAnnouncement(t('cardLayoutRestored')) }}>{t('cardLayoutReset')}</button>
        {storageError && <p role="alert">{t('cardLayoutSaveFailed')}</p>}
      </div>
    </details>
    <span className={css.layoutAnnouncement} role="status">{announcement}</span>
    {visible.length === 0 ? <p className={css.noCards}>{t('cardsAllHidden')}</p> : <div className={css.accountBalances}>
      {visible.map((card, index) => <div className={css.cardSlot} key={card.id} data-card-id={card.id} data-dragging={dragged === card.id} data-drop-target={dropTarget === card.id}
        onDragOver={event => { if (source.current && source.current !== card.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(card.id) } }}
        onDrop={event => { if (source.current) { event.preventDefault(); move(source.current, card.id) } endDrag() }}>
        <div className={css.cardTools}>
          <button type="button" className={css.cardGrip} draggable aria-label={t('cardDrag', { name: card.label })} title={t('cardDragHint')}
            onDragStart={event => { source.current = card.id; setDragged(card.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.id); event.dataTransfer.setDragImage(event.currentTarget.closest('[data-card-id]')!, 24, 24) }}
            onDragEnd={endDrag} onKeyDown={event => {
              const offset = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : 0
              const target = visible[index + offset]
              if (offset) {
                event.preventDefault()
                if (target) { const handle = event.currentTarget; move(card.id, target.id); queueMicrotask(() => { if (handle.isConnected) handle.focus() }) }
              }
            }}>
            <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true"><circle cx="4" cy="3" r="1.3" /><circle cx="10" cy="3" r="1.3" /><circle cx="4" cy="8" r="1.3" /><circle cx="10" cy="8" r="1.3" /><circle cx="4" cy="13" r="1.3" /><circle cx="10" cy="13" r="1.3" /></svg>
          </button>
          <button type="button" aria-label={t('cardHide', { name: card.label })} title={t('cardHide', { name: card.label })} onClick={() => { visibility(card.id, false); summary.current?.focus() }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 3 8 8M11 3l-8 8" /></svg>
          </button>
        </div>
        {card.content}
      </div>)}
    </div>}
  </>
}
