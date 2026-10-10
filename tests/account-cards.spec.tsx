// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountCards, CARD_LAYOUT_KEY, moveCard, readCardLayout, type AccountCard } from '../src/client/usage/AccountCards.tsx'
import { en, type UsageKey } from '../src/client/usage/locales.ts'
const t = (key: UsageKey, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(args?.[name] ?? ''))
const cards: AccountCard[] = [
  { id: 'deepseek', label: 'DeepSeek', content: <section aria-label="DeepSeek"><h3>DeepSeek</h3><p>CNY 9.97</p></section> },
  { id: 'codex/a', label: 'Codex · Work', content: <section aria-label="Work"><h3>Codex</h3><p>84%</p></section> },
  { id: 'codex/b', label: 'Codex · Personal', content: <section aria-label="Personal"><h3>Codex</h3><p>25%</p></section> },
]
const ids = (container: HTMLElement) => [...container.querySelectorAll('[data-card-id]')].map(element => element.getAttribute('data-card-id'))
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
it('normalizes persisted IDs and ignores malformed, oversized or incompatible settings', () => {
  for (const value of ['bad-json', 'null', '{}', JSON.stringify({ version: 1, order: ['deepseek'], hidden: [1] }), JSON.stringify({ version: 2, order: [], hidden: [] })]) {
    localStorage.setItem(CARD_LAYOUT_KEY, value)
    expect(readCardLayout()).toEqual({ version: 1, order: [], hidden: [] })
  }
  localStorage.setItem(CARD_LAYOUT_KEY, JSON.stringify({ version: 1, order: ['deepseek', 'deepseek'], hidden: ['codex/a', 'codex/a'], extra: 'SECRET' }))
  expect(readCardLayout()).toEqual({ version: 1, order: ['deepseek'], hidden: ['codex/a'] })
  expect(moveCard(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
  expect(moveCard(['a', 'b', 'c'], 'missing', 'c')).toEqual(['a', 'b', 'c'])
})
it('supports native grip dragging and retains order across data refresh and remount', () => {
  const view = render(<AccountCards cards={cards} t={t} />)
  const transfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' }
  fireEvent.dragStart(screen.getByRole('button', { name: 'Reorder DeepSeek' }), { dataTransfer: transfer })
  const target = view.container.querySelector('[data-card-id="codex/b"]')!
  fireEvent.dragOver(target, { dataTransfer: transfer })
  expect(target.getAttribute('data-drop-target')).toBe('true')
  fireEvent.drop(target, { dataTransfer: transfer })
  expect(ids(view.container)).toEqual(['codex/a', 'codex/b', 'deepseek'])
  expect(transfer.setData).toHaveBeenCalledWith('text/plain', 'deepseek')
  view.rerender(<AccountCards cards={[...cards].reverse()} t={t} />)
  expect(ids(view.container)).toEqual(['codex/a', 'codex/b', 'deepseek'])
  view.unmount()
  const reopened = render(<AccountCards cards={cards} t={t} />)
  expect(ids(reopened.container)).toEqual(['codex/a', 'codex/b', 'deepseek'])
  const saved = JSON.parse(localStorage.getItem(CARD_LAYOUT_KEY)!)
  expect(saved.order).toEqual(['codex/a', 'codex/b', 'deepseek'])
  expect(Object.keys(saved)).toEqual(['version', 'order', 'hidden'])
  expect(JSON.stringify(saved)).not.toMatch(/CNY|9\.97|84%|Personal|Work/)
})
it('hides individual account cards and restores them without losing order', () => {
  const view = render(<AccountCards cards={cards} t={t} />)
  fireEvent.click(screen.getByText(en.cardLayout))
  fireEvent.click(screen.getByRole('button', { name: 'Move Codex · Personal earlier' }))
  fireEvent.click(screen.getByRole('button', { name: 'Hide Codex · Work' }))
  expect(screen.queryByRole('region', { name: 'Work' })).toBeNull()
  expect(screen.getByRole('region', { name: 'Personal' })).toBeTruthy()
  expect(ids(view.container)).toEqual(['deepseek', 'codex/b'])
  fireEvent.click(screen.getByRole('checkbox', { name: 'Codex · Work' }))
  expect(ids(view.container)).toEqual(['deepseek', 'codex/b', 'codex/a'])
  fireEvent.click(screen.getByRole('button', { name: en.cardLayoutReset }))
  expect(ids(view.container)).toEqual(['deepseek', 'codex/a', 'codex/b'])
  expect((screen.getByRole('checkbox', { name: 'Codex · Work' }) as HTMLInputElement).checked).toBe(true)
})
it('allows hiding every card while retaining visible controls to restore them', () => {
  render(<AccountCards cards={cards} t={t} />)
  for (const card of cards) fireEvent.click(screen.getByRole('button', { name: `Hide ${card.label}` }))
  expect(screen.getByText(en.cardsAllHidden)).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'DeepSeek' })).toBeNull()
  fireEvent.click(screen.getByText(en.cardLayout))
  fireEvent.click(screen.getByRole('checkbox', { name: 'DeepSeek' }))
  expect(screen.getByRole('region', { name: 'DeepSeek' })).toBeTruthy()
  expect(screen.queryByText(en.cardsAllHidden)).toBeNull()
})
it('moves cards with arrow keys and appends new accounts without reordering existing ones', () => {
  const view = render(<AccountCards cards={cards} t={t} />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Codex · Personal' }), { key: 'ArrowLeft' })
  expect(ids(view.container)).toEqual(['deepseek', 'codex/b', 'codex/a'])
  const extra = { id: 'claude/current', label: 'Claude', content: <section aria-label="Claude">Claude</section> }
  view.rerender(<AccountCards cards={[extra, ...cards]} t={t} />)
  expect(ids(view.container)).toEqual(['deepseek', 'codex/b', 'codex/a', 'claude/current'])
  fireEvent.drop(view.container.querySelector('[data-card-id="deepseek"]')!) // foreign drop: no local drag in progress
  expect(ids(view.container)).toEqual(['deepseek', 'codex/b', 'codex/a', 'claude/current'])
})
it('keeps changes usable when localStorage cannot be written and warns instead of crashing', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded') })
  const view = render(<AccountCards cards={cards} t={t} />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder DeepSeek' }), { key: 'ArrowRight' })
  expect(ids(view.container)).toEqual(['codex/a', 'deepseek', 'codex/b'])
  fireEvent.click(screen.getByText(en.cardLayout))
  expect(screen.getByRole('alert').textContent).toBe(en.cardLayoutSaveFailed)
})
