// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ProviderPanel, sliderIndexFromPoint, type ProviderPanelProps } from '../src/client/ProviderPanel.tsx'
import { en } from '../src/client/locales.ts'
import type { CodexAccountsState } from '../src/client/providers/codex.ts'
afterEach(cleanup)
function bench(options: { fail?: boolean; empty?: boolean; codex?: boolean } = {}) {
  const state: ModelDirectoryState = { current: { provider: 'a', model: 'sol', reasoningEffort: 'high' }, routable: true,
    groups: options.empty ? [] : [
      { id: 'a', name: 'Provider A', models: [
        { id: 'sol', name: 'Sol', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } },
        { id: 'plain', name: 'Plain' },
      ] },
      { id: 'b', name: 'Provider B', models: [{ id: 'beta', name: 'Beta' }] },
      ...options.codex ? [{ id: 'openai-codex', name: 'ChatGPT subscription', models: [{ id: 'codex', name: 'Codex' }] }] : [],
    ], status: 'ready', error: null, failures: [] }
  const accountState: CodexAccountsState = { status: 'ready', error: null, accounts: options.codex ? [
    { id: 'work', label: 'Work', email: 'work@example.com', active: true },
    { id: 'personal', label: 'Personal', email: 'personal@example.com', active: false },
  ] : [], usage: options.codex ? { work: { status: 'ready', value: { weeklyPercent: 76 } } } : {} }
  const select = vi.fn(async () => { if (options.fail) throw new Error('rejected') })
  const selectAccount = vi.fn(async () => { if (options.fail) throw new Error('account rejected') })
  const readQuota = vi.fn(async () => { if (options.fail) throw new Error('quota rejected') })
  const loadDirectory = vi.fn(async () => {})
  const loadAccounts = vi.fn(async () => {})
  const props = { locked: false, available: true,
    useDirectory: (selector: (s: ModelDirectoryState) => unknown) => selector(state),
    useAccounts: (selector: (s: CodexAccountsState) => unknown) => selector(accountState),
    select, selectAccount, readQuota, loadDirectory, loadAccounts,
    t: (key: keyof typeof en, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(args?.[k] ?? '')) } as unknown as ProviderPanelProps
  const view = render(<ProviderPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: en.title }))
  return { select, selectAccount, readQuota, loadDirectory, loadAccounts, view }
}
describe('model panel component', () => {
  it('renders separate provider and model triggers, then scopes models to the chosen provider', async () => {
    const b = bench()
    expect(screen.getByRole('button', { name: en.providerTitle })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.title })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.title }))
    fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: en.providerTitle })).toBeTruthy())
    fireEvent.click(screen.getByRole('option', { name: /Provider B/ }))
    fireEvent.click(screen.getByRole('button', { name: en.title }))
    expect(screen.getByRole('dialog', { name: en.title }).textContent).toContain('Provider B')
    fireEvent.click(screen.getByRole('button', { name: 'Select Beta' }))
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'b', model: 'beta' }))
  })

  it('lists Codex accounts separately and selects the real account without selecting a model', async () => {
    const b = bench({ codex: true })
    fireEvent.click(screen.getByRole('button', { name: en.title }))
    fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
    await waitFor(() => expect(b.loadAccounts).toHaveBeenCalledOnce())
    expect(screen.getByRole('group', { name: 'ChatGPT subscription' }).textContent).toContain('2 accounts')
    expect(screen.getByRole('group', { name: 'ChatGPT subscription' }).textContent).not.toContain('5')
    expect(screen.getByRole('option', { name: /Work/ }).textContent).toContain('wo***@example.com')
    fireEvent.click(screen.getByRole('option', { name: /Personal/ }))
    await waitFor(() => expect(b.selectAccount).toHaveBeenCalledWith('personal'))
    expect(b.select).not.toHaveBeenCalled()
  })

  it('shows the read weekly quota and reads another account on demand', async () => {
    const b = bench({ codex: true })
    fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
    await waitFor(() => expect(screen.getByRole('group', { name: 'ChatGPT subscription' })).toBeTruthy())
    expect(screen.getByRole('option', { name: /Work/ }).textContent).toContain('wk 76%')
    fireEvent.click(screen.getByRole('button', { name: en.readQuota }))
    await waitFor(() => expect(b.readQuota).toHaveBeenCalledWith('personal'))
    expect(b.selectAccount).not.toHaveBeenCalled()
  })

  it('opens, loads and shows an honest unsupported-context notice', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.contextUnsupported)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '1M' })).toBeNull()
    fireEvent.keyDown(screen.getByTestId('dsh-provider-extension'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('selects models without reasoning and submits no unknown fields', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Select Plain' }))
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'a', model: 'plain' }))
  })
  it('reports rejection and restores the slider to authoritative state', async () => {
    const b = bench({ fail: true })
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '0' } })
    fireEvent.keyUp(slider, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('rejected'))
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('1')
  })
  it('previews every step of a drag and submits only once when it ends', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '0' } })
    fireEvent.change(slider, { target: { value: '1' } })
    fireEvent.change(slider, { target: { value: '0' } })
    expect(b.select).not.toHaveBeenCalled()
    fireEvent.keyUp(slider, { key: 'ArrowLeft' })
    await waitFor(() => expect(b.select).toHaveBeenCalledTimes(1))
    expect(b.select).toHaveBeenCalledWith({ provider: 'a', model: 'sol', reasoningEffort: 'low' })
  })
  it('skips the request when a drag ends on the effort already in use', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '0' } })
    fireEvent.change(slider, { target: { value: '1' } })
    fireEvent.keyUp(slider, { key: 'ArrowRight' })
    expect(b.select).not.toHaveBeenCalled()
  })
  it('maps a pointer position to any effort step, not just the next one', () => {
    const rect = { left: 100, width: 220 }
    expect(sliderIndexFromPoint(100, rect, 4)).toBe(0)
    expect(sliderIndexFromPoint(170, rect, 4)).toBe(1)
    expect(sliderIndexFromPoint(320, rect, 4)).toBe(3)
    expect(sliderIndexFromPoint(-50, rect, 4)).toBe(0)
    expect(sliderIndexFromPoint(900, rect, 4)).toBe(3)
    expect(sliderIndexFromPoint(150, rect, 1)).toBe(0)
    expect(sliderIndexFromPoint(150, rect, 0)).toBe(-1)
  })
  it('labels every effort step inside the track and keeps no effort text on the row', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const dialog = screen.getByRole('dialog', { name: en.title })
    expect(dialog.querySelectorAll('[data-provider-panel-track] [data-edge]')).toHaveLength(2)
    expect(dialog.textContent).toContain('Low')
    expect(dialog.textContent).toContain('High')
  })
  it('shows an empty catalog rather than permanent loading', async () => {
    const b = bench({ empty: true })
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByText(en.empty)).toBeTruthy())
  })
  it('closes on outside click', () => {
    bench()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
