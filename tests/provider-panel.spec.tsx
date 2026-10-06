// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ProviderPanel, sliderIndexFromPoint, type ProviderPanelProps } from '../src/client/ProviderPanel.tsx'
import { en } from '../src/client/locales.ts'
import css from '../src/client/ProviderPanel.module.css'
import { saveCodexEnabledModels, CODEX_ENABLED_MODELS_KEY } from '../src/client/codex-visibility.ts'
import type { CodexAccountsState } from '../src/client/providers/codex.ts'
afterEach(cleanup)
function bench(options: { fail?: boolean; empty?: boolean; codex?: boolean; provider?: string } = {}) {
  const currentProvider = options.provider ?? 'a'
  const state: ModelDirectoryState = { current: { provider: currentProvider, model: 'sol', reasoningEffort: 'high' }, routable: true,
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
  return { select, selectAccount, readQuota, loadDirectory, loadAccounts, view, state, props }
}
describe('model panel component', () => {
  it('opens the OpenCode model pane without silently falling back to the current provider', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
    fireEvent.click(screen.getByRole('option', { name: /OpenCode/ }))
    expect(screen.getByRole('dialog', { name: en.title }).querySelector(`.${css.headTitle}`)?.textContent).toBe(en.providerOpenCode)
    expect(screen.getByText(en.opencodeCatalogUnavailable)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Select Sol' })).toBeNull()
    expect(b.select).not.toHaveBeenCalled()
    b.state.groups.push({ id: 'opencode-go', name: 'OpenCode', models: [{ id: 'real-host-model', name: 'Real Host Model' }] })
    b.view.rerender(<ProviderPanel {...b.props} />)
    expect(screen.queryByText(en.opencodeCatalogUnavailable)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Select Real Host Model' }))
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'opencode-go', model: 'real-host-model' }))
  })
  it('opens and selects an already loaded OpenCode catalog', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    b.state.groups.push({ id: 'opencode-go', name: 'OpenCode', models: [{ id: 'live-opencode', name: 'Live OpenCode' }] })
    b.view.rerender(<ProviderPanel {...b.props} />)
    fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
    fireEvent.click(screen.getByRole('option', { name: /OpenCode/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Live OpenCode' }))
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'opencode-go', model: 'live-opencode' }))
  })
  it.each([
    ['deepseek-official', 'DeepSeek', en.providerDeepseekApi, en.deepseekApiHint],
    ['deepseek-account', 'DeepSeek Account', en.providerDeepseekAccount, en.deepseekAccountHint],
  ])('keeps native DeepSeek models separate from other providers visibility and explains setup: %s', async (id, name, label, hint) => {
    localStorage.setItem('dsh-provider-extension:disabled-models', JSON.stringify(['deepseek-flash', 'deepseek-v4-pro']))
    try {
      const b = bench()
      await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
      b.state.groups.push({ id, name, models: [
        { id: 'deepseek-flash', name: 'DeepSeek Flash' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek Pro' },
      ] })
      b.view.rerender(<ProviderPanel {...b.props} />)
      fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
      fireEvent.click(screen.getByRole('option', { name: new RegExp(label) }))
      fireEvent.click(screen.getByRole('button', { name: en.title }))
      expect(screen.getByText(hint)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Select DeepSeek Flash' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Select DeepSeek Pro' }))
      await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: id, model: 'deepseek-v4-pro' }))
    } finally { localStorage.removeItem('dsh-provider-extension:disabled-models') }
  })
  it('shows account setup instructions when a refreshed native account catalog is empty', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    b.state.groups.push({ id: 'deepseek-account', name: 'DeepSeek Account', models: [] })
    b.view.rerender(<ProviderPanel {...b.props} />)
    fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
    fireEvent.click(screen.getByRole('option', { name: /DeepSeek Account/ }))
    fireEvent.click(screen.getByRole('button', { name: en.title }))
    expect(screen.getByText(en.deepseekAccountHint)).toBeTruthy()
    expect(screen.queryByText(en.empty)).toBeNull()
    expect(screen.queryByText(en.loading)).toBeNull()
  })
  it.each([
    ['openai-codex', 'ChatGPT subscription', en.providerCodex],
    ['google-antigravity', 'Antigravity', en.providerAntigravity],
  ])('uses the canonical provider name in header, trigger and list without changing route %s', async (id, oldName, displayName) => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    b.state.groups[0]!.id = id
    b.state.groups[0]!.name = oldName
    b.state.current = { provider: id, model: 'sol', reasoningEffort: 'high' }
    b.view.rerender(<ProviderPanel {...b.props} />)
    expect(screen.getByRole('button', { name: en.providerTitle }).getAttribute('title')).toBe(displayName)
    expect(screen.getByRole('dialog', { name: en.title }).textContent).toContain(displayName)
    expect(screen.getByRole('dialog', { name: en.title }).querySelector(`.${css.headTitle}`)?.textContent).toBe(displayName)
    fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
    expect(screen.getByRole('option', { name: new RegExp(displayName) })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.title }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Plain' }))
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: id, model: 'plain' }))
  })
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
    expect(screen.getByRole('group', { name: en.providerCodex }).textContent).toContain('2 accounts')
    expect(screen.getByRole('group', { name: en.providerCodex }).textContent).not.toContain('5')
    expect(screen.getByRole('option', { name: /Work/ }).textContent).toContain('wo***@example.com')
    fireEvent.click(screen.getByRole('option', { name: /Personal/ }))
    await waitFor(() => expect(b.selectAccount).toHaveBeenCalledWith('personal'))
    expect(b.select).not.toHaveBeenCalled()
  })

  it('shows the read weekly quota and reads another account on demand', async () => {
    const b = bench({ codex: true })
    fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
    await waitFor(() => expect(screen.getByRole('group', { name: en.providerCodex })).toBeTruthy())
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
  it('reuses a warm catalog on reopen but keeps explicit reload available', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByRole('button', { name: en.reload }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: en.title }))
    fireEvent.click(screen.getByRole('button', { name: en.title }))
    fireEvent.click(screen.getByRole('button', { name: en.providerTitle }))
    fireEvent.click(screen.getByRole('button', { name: en.title }))
    expect(b.loadDirectory).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.reload }))
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledTimes(2))
  })
  it('does not cancel a slider preview when a catalog refresh finishes', async () => {
    const b = bench()
    await waitFor(() => expect(screen.getByRole('button', { name: en.reload }).hasAttribute('disabled')).toBe(false))
    let finish!: () => void
    b.loadDirectory.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    fireEvent.click(screen.getByRole('button', { name: en.reload }))
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledTimes(2))
    const slider = screen.getByRole('slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0' } })
    await act(async () => { finish() })
    expect(slider.value).toBe('0')
    fireEvent.keyUp(slider, { key: 'ArrowLeft' })
    await waitFor(() => expect(b.select).toHaveBeenCalledExactlyOnceWith({ provider: 'a', model: 'sol', reasoningEffort: 'low' }))
  })
  it('uses transform-only slider position and keeps refresh status in the header', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const fill = document.querySelector(`.${css.fill}`) as HTMLElement
    const position = document.querySelector(`.${css.thumbPosition}`) as HTMLElement
    expect(fill.style.transform).toBe('scaleX(1)')
    expect(fill.style.width).toBe('')
    expect(position.style.transform).toBe('translateX(100%)')
    expect(position.style.left).toBe('')
    expect(screen.queryByRole('status')).toBeNull()
    expect(document.querySelector('details')?.open).toBe(false)
  })
  it('keeps the selected effort through default-save background catalog refresh and delayed projection', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const dialog = screen.getByRole('dialog', { name: en.title })
    const slider = screen.getByRole('slider') as HTMLInputElement
    let finish!: () => void
    b.select.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    fireEvent.keyUp(screen.getByRole('slider'), { key: 'ArrowLeft' })
    expect(slider.value).toBe('0')
    expect(slider.disabled).toBe(false)
    b.state.status = 'loading'
    b.view.rerender(<ProviderPanel {...b.props} />)
    await act(async () => { finish() })
    expect(screen.getByRole('dialog', { name: en.title })).toBe(dialog)
    expect(screen.queryByText(en.loading)).toBeNull()
    expect(slider.value).toBe('0')
    expect(b.loadDirectory).toHaveBeenCalledOnce()
    b.state.current = { provider: 'a', model: 'sol', reasoningEffort: 'low' }
    b.state.status = 'ready'
    b.view.rerender(<ProviderPanel {...b.props} />)
    expect(slider.value).toBe('0')
    // Once acknowledged, external authoritative changes are followed normally.
    b.state.current = { provider: 'a', model: 'sol', reasoningEffort: 'high' }
    b.view.rerender(<ProviderPanel {...b.props} />)
    expect(slider.value).toBe('1')
  })
  it('serializes rapid model and effort changes, keeping only the latest queued intent', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    let finish!: () => void
    b.select.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    fireEvent.keyUp(screen.getByRole('slider'), { key: 'ArrowLeft' })
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } })
    fireEvent.keyUp(screen.getByRole('slider'), { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Select Plain' }))
    expect(b.select).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Select Plain' }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => { finish() })
    await waitFor(() => expect(b.select).toHaveBeenCalledTimes(2))
    expect(b.select.mock.calls[1]).toEqual([{ provider: 'a', model: 'plain' }])
    expect(screen.getByRole('button', { name: 'Select Plain' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('rolls a rejected queued choice back to the last successful choice, not the stale projection', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    let finish!: () => void
    b.select.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    b.select.mockRejectedValueOnce(new Error('choice rejected'))
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    fireEvent.keyUp(screen.getByRole('slider'), { key: 'ArrowLeft' })
    fireEvent.click(screen.getByRole('button', { name: 'Select Plain' }))
    await act(async () => { finish() })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('choice rejected'))
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('0')
  })
  it('selects models without reasoning and submits no unknown fields', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Select Plain' }))
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'a', model: 'plain' }))
  })
  it('selects model when clicking anywhere on the row card outside the track', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const row = document.querySelector('[data-provider-panel-model="plain"]')
    expect(row).toBeTruthy()
    fireEvent.click(row!)
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
  it('keeps remembered inactive efforts neutral and renders progress only for the active row', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    b.state.groups[0]!.models.push({ id: 'luna', name: 'Luna', reasoning: {
      defaultEffort: 'high', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }],
    } })
    b.view.rerender(<ProviderPanel {...b.props} />)
    const other = document.querySelector('[data-provider-panel-model="luna"]')!
    expect((other.querySelector('input') as HTMLInputElement).value).toBe('1')
    expect(other.querySelector('[data-active="true"]')).toBeNull()
    expect(other.querySelector(`.${css.fill}`)).toBeNull()
    expect(other.querySelector(`.${css.thumb}`)).toBeNull()
    expect(other.querySelectorAll('[data-edge]')).toHaveLength(2)
    const dialog = screen.getByRole('dialog', { name: en.title })
    expect(dialog.querySelectorAll(`.${css.thumb}`)).toHaveLength(1)
    expect(dialog.querySelectorAll('[data-current="true"]')).toHaveLength(1)
  })
  it('uses hysteresis around boundaries without delaying clicks or skipping endpoints', () => {
    const rect = { left: 0, width: 420 }
    // Five stops: 10, 110, 210, 310, 410; boundary at 160.
    expect(sliderIndexFromPoint(161, rect, 5)).toBe(2)
    expect(sliderIndexFromPoint(161, rect, 5, 1)).toBe(1)
    expect(sliderIndexFromPoint(166, rect, 5, 1)).toBe(2)
    expect(sliderIndexFromPoint(159, rect, 5, 2)).toBe(2)
    expect(sliderIndexFromPoint(154, rect, 5, 2)).toBe(1)
    expect(sliderIndexFromPoint(410, rect, 5, 1)).toBe(4)
    expect(sliderIndexFromPoint(10, rect, 5, 4)).toBe(0)
  })
  it('keeps pointer preview stable at a boundary and commits once without a release flash', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const track = document.querySelector('[data-provider-panel-track]') as HTMLElement
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 220 } as DOMRect)
    let finish!: () => void
    b.select.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const pointer = (type: string, x: number) => fireEvent(track, new MouseEvent(type, {
      bubbles: true, clientX: x, clientY: 20, button: 0,
    }))
    const slider = screen.getByRole('slider') as HTMLInputElement
    pointer('pointerdown', 10)
    for (const x of [109, 111, 109, 112]) pointer('pointermove', x)
    expect(slider.value).toBe('0')
    pointer('pointermove', 116)
    expect(slider.value).toBe('1')
    pointer('pointermove', 109)
    expect(slider.value).toBe('1')
    pointer('pointermove', 104)
    expect(slider.value).toBe('0')
    pointer('pointerup', 104)
    await waitFor(() => expect(b.select).toHaveBeenCalledTimes(1))
    expect(slider.value).toBe('0')
    // Pointer movement after release must not alter the pending preview.
    pointer('pointermove', 210)
    expect(slider.value).toBe('0')
    b.state.current = { provider: 'a', model: 'sol', reasoningEffort: 'low' }
    finish()
    await waitFor(() => expect(slider.disabled).toBe(false))
    expect(slider.value).toBe('0')
    expect(b.select).toHaveBeenCalledTimes(1)
  })
  it('transfers the active highlight to the hovered model during vertical drag and dims the initial model', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const initialRow = document.querySelector('[data-provider-panel-model="sol"]')!
    const otherRow = document.querySelector('[data-provider-panel-model="plain"]')!
    expect(initialRow.getAttribute('data-current')).toBe('true')
    expect(otherRow.getAttribute('data-current')).toBe('false')

    const track = initialRow.querySelector('[data-provider-panel-track]')!
    fireEvent(track, new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 50, button: 0 }))
    expect(initialRow.getAttribute('data-current')).toBe('true')

    const originalElementFromPoint = document.elementFromPoint
    const origGetBounding = otherRow.getBoundingClientRect
    otherRow.getBoundingClientRect = () => ({ top: 100, bottom: 140, left: 0, right: 300, width: 300, height: 40, x: 0, y: 100, toJSON: () => {} })
    document.elementFromPoint = () => otherRow
    try {
      fireEvent(track, new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 120 }))
      expect(otherRow.getAttribute('data-current')).toBe('true')
      expect(initialRow.getAttribute('data-current')).toBe('false')

      fireEvent(track, new MouseEvent('pointerup', { bubbles: true, clientX: 100, clientY: 120 }))
      await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'a', model: 'plain' }))
    } finally {
      document.elementFromPoint = originalElementFromPoint
      otherRow.getBoundingClientRect = origGetBounding
    }
  })
  it('labels every effort step inside the track and keeps no effort text on the row', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    const dialog = screen.getByRole('dialog', { name: en.title })
    expect(dialog.querySelectorAll('[data-provider-panel-track] [data-edge]')).toHaveLength(2)
    expect(screen.getAllByText('Low')).toHaveLength(1)
    expect(screen.getAllByText('High')).toHaveLength(2) // track label and compact trigger
    expect(screen.queryByRole('group', { name: en.effort })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Low' })).toBeNull()
  })
  it('remembers a previously chosen effort tier when switching models', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    fireEvent.keyUp(screen.getByRole('slider'), { key: 'ArrowLeft' })
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'a', model: 'sol', reasoningEffort: 'low' }))

    fireEvent.click(screen.getByRole('button', { name: 'Select Plain' }))
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'a', model: 'plain' }))

    fireEvent.click(screen.getByRole('button', { name: 'Select Sol' }))
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'a', model: 'sol', reasoningEffort: 'low' }))
  })
  it('shows an empty catalog rather than permanent loading', async () => {
    const b = bench({ empty: true })
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByText(en.empty)).toBeTruthy())
  })
  it('filters out disabled models according to model visibility settings', async () => {
    localStorage.setItem('dsh-provider-extension:disabled-models', JSON.stringify(['plain']))
    try {
      const b = bench()
      await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
      const dialog = screen.getByRole('dialog', { name: en.title })
      expect(dialog.textContent).toContain('Sol')
      expect(dialog.textContent).not.toContain('Select Plain')
    } finally {
      localStorage.removeItem('dsh-provider-extension:disabled-models')
    }
  })
  it('renders quota pill in the composer bar with 5h remaining and weekly quota on hover', async () => {
    bench({ codex: true, provider: 'openai-codex' })
    const quotaBtn = screen.getByRole('button', { name: /wk 76%/ })
    expect(quotaBtn).toBeTruthy()
    expect(screen.getByText('5小时额度:')).toBeTruthy()
    expect(screen.getByText('周额度:')).toBeTruthy()
    expect(screen.getByText('76%')).toBeTruthy()
  })
  it('displays 5h quota by default on the pill and weekly for pro accounts', async () => {
    const props = {
      locked: false, available: true,
      useDirectory: (selector: any) => selector({ status: 'ready', groups: [{ id: 'openai-codex', name: 'ChatGPT', models: [{ id: 'codex', name: 'Codex' }] }], current: { provider: 'openai-codex', model: 'codex' }, error: null, failures: [] }),
      useAccounts: (selector: any) => selector({
        status: 'ready', error: null,
        accounts: [{ id: 'plus-user', label: 'Plus User', active: true, planType: 'PLUS' }],
        usage: { 'plus-user': { status: 'ready', value: { shortPercent: 44, weeklyPercent: 88 } } },
      }),
      useAntigravity: (selector: any) => selector({ status: 'idle', accounts: [] }),
      select: vi.fn(), selectAccount: vi.fn(), readQuota: vi.fn(), loadDirectory: vi.fn(), loadAccounts: vi.fn(),
      t: (key: keyof typeof en, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(args?.[k] ?? '')),
    } as any
    const { unmount } = render(<ProviderPanel {...props} />)
    expect(screen.getByRole('button', { name: /5h 44%/ })).toBeTruthy()
    unmount()

    const proProps = {
      ...props,
      useAccounts: (selector: any) => selector({
        status: 'ready', error: null,
        accounts: [{ id: 'pro-user', label: 'Pro User', active: true, planType: 'PRO' }],
        usage: { 'pro-user': { status: 'ready', value: { shortPercent: 44, weeklyPercent: 88 } } },
      }),
    }
    render(<ProviderPanel {...proProps} />)
    expect(screen.getByRole('button', { name: /wk 88%/ })).toBeTruthy()
  })
  it('filters out Codex models disabled for the active Codex account', async () => {
    localStorage.setItem('dsh-provider-extension:account-disabled-models', JSON.stringify({
      work: ['codex'],
    }))
    try {
      bench({ codex: true, provider: 'openai-codex' })
      const dialog = screen.getByRole('dialog', { name: en.title })
      expect(dialog.textContent).not.toContain('Select Codex')
    } finally {
      localStorage.removeItem('dsh-provider-extension:account-disabled-models')
    }
  })
  it('shows only the active account’s enabled models and reacts to settings changes', async () => {
    try {
      saveCodexEnabledModels('work', undefined, new Set(['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna']))
      saveCodexEnabledModels('personal', undefined, new Set(['gpt-5.4']))
      const b = bench({ codex: true, provider: 'openai-codex' })
      await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
      b.state.groups.find(group => group.id === 'openai-codex')!.models = [
        { id: 'gpt-6-astra', name: 'GPT-6 Astra' }, { id: 'gpt-5.4', name: 'GPT-5.4' },
      ]
      b.view.rerender(<ProviderPanel {...b.props} />)
      expect(screen.getByRole('button', { name: 'Select GPT-6 Astra' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Select GPT-5.4' })).toBeNull()
      // Enabled but absent from the Host catalog must not be fabricated.
      expect(screen.queryByRole('button', { name: 'Select GPT-6 Sol' })).toBeNull()
      act(() => saveCodexEnabledModels('work', undefined, new Set(['gpt-5.4'])))
      expect(screen.getByRole('button', { name: 'Select GPT-5.4' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Select GPT-6 Astra' })).toBeNull()
    } finally { localStorage.removeItem(CODEX_ENABLED_MODELS_KEY) }
  })

  it('closes on outside click', () => {
    bench()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
