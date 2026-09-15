// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ModelPanel, type ModelPanelProps } from '../src/client/ModelPanel.tsx'
import { en } from '../src/client/locales.ts'
import type { CodexAccountsState } from '../src/client/codexAccounts.ts'
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
  ] : [] }
  const select = vi.fn(async () => { if (options.fail) throw new Error('rejected') })
  const selectAccount = vi.fn(async () => { if (options.fail) throw new Error('account rejected') })
  const loadDirectory = vi.fn(async () => {})
  const loadAccounts = vi.fn(async () => {})
  const props = { locked: false, available: true,
    useDirectory: (selector: (s: ModelDirectoryState) => unknown) => selector(state),
    useAccounts: (selector: (s: CodexAccountsState) => unknown) => selector(accountState),
    select, selectAccount, loadDirectory, loadAccounts,
    t: (key: keyof typeof en, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(args?.[k] ?? '')) } as unknown as ModelPanelProps
  const view = render(<ModelPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: en.title }))
  return { select, selectAccount, loadDirectory, loadAccounts, view }
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

  it('opens, loads and shows an honest unsupported-context notice', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.contextUnsupported)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '1M' })).toBeNull()
    fireEvent.keyDown(screen.getByTestId('dsh-model-panel'), { key: 'Escape' })
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
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('rejected'))
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('1')
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
