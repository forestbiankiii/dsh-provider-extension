// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderSettings, type ProviderSettingsProps } from '../src/client/ProviderSettings.tsx'
import { en } from '../src/client/locales.ts'
import type { AntigravityState } from '../src/client/providers/antigravity.ts'
import type { CodexAccountsState } from '../src/client/providers/codex.ts'

afterEach(cleanup)

const emptyAccounts: CodexAccountsState = { status: 'ready', error: null, accounts: [], usage: {}, restoreFailed: false }
const codexAccounts: CodexAccountsState = {
  status: 'ready', error: null, restoreFailed: false,
  accounts: [{ id: 'work', label: 'Work', email: 'work@example.com', active: true }],
  usage: { work: { status: 'ready', value: { weeklyPercent: 76 } } },
}

function bench(antigravity: AntigravityState, accounts: CodexAccountsState = emptyAccounts) {
  const loadAccounts = vi.fn(async () => {})
  const loginAntigravity = vi.fn(async () => {})
  const loginCodex = vi.fn(async () => {})
  const renameCodexAccount = vi.fn(async () => {})
  const removeCodexAccount = vi.fn(async () => {})
  const renameAntigravityAccount = vi.fn(async () => {})
  const readAntigravityQuota = vi.fn(async () => {})
  const selectAntigravityAccount = vi.fn(async () => {})
  const props = {
    useAccounts: (selector: (state: CodexAccountsState) => unknown) => selector(accounts),
    useAntigravity: (selector: (state: AntigravityState) => unknown) => selector(antigravity),
    loadAccounts,
    readQuota: vi.fn(async () => {}),
    loginCodex,
    renameCodexAccount,
    removeCodexAccount,
    loadAntigravity: vi.fn(async () => {}),
    loginAntigravity,
    logoutAntigravity: vi.fn(async () => {}),
    renameAntigravityAccount,
    readAntigravityQuota,
    selectAntigravityAccount,
    t: (key: keyof typeof en, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(args?.[name] ?? '')),
  } as unknown as ProviderSettingsProps
  const view = render(<ProviderSettings {...props} />)
  return { loadAccounts, loginAntigravity, loginCodex, renameCodexAccount, removeCodexAccount, renameAntigravityAccount, readAntigravityQuota, view }
}

describe('provider settings surface', () => {
  it('renders the refreshed provider overview without redundant create catalog', () => {
    bench({ status: 'ready' }, codexAccounts)
    expect(screen.queryByTestId('provider-catalog')).toBeNull()
    expect(screen.queryByRole('button', { name: en.createProvider })).toBeNull()
    fireEvent.click(screen.getByText(en.providerCodex))
    expect(screen.getAllByRole('button', { name: en.providerRefresh }).length).toBeGreaterThanOrEqual(1)
  })

  it('shows the starting hint when antigravity status is absent', () => {
    bench({ status: 'absent' })
    fireEvent.click(screen.getByText(en.providerAntigravity))
    expect(screen.getByText(en.antigravityInstallHint)).toBeTruthy()
  })

  it('shows the signed-in account and its models, and starts a login on demand', () => {
    const b = bench({
      status: 'ready',
      accounts: [
        { id: 'fo***@gmail.com', label: 'Google Account', email: 'fo***@gmail.com', active: true },
      ],
      view: { riskAcknowledged: true, login: { phase: 'success', configured: true, projectAvailable: true, maskedEmail: 'fo***@gmail.com' } },
      models: { state: 'live-available', models: [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', state: 'live-available' }] },
    })
    fireEvent.click(screen.getByText(en.providerAntigravity))
    expect(screen.getAllByText(/fo\*\*\*@gmail\.com/).length).toBeGreaterThanOrEqual(1)
    const card = screen.getByRole('button', { name: en.quotaView })
    fireEvent.click(card)
    expect(screen.getByText('Gemini 3.8 Flash')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: en.addAccount })[0]!)
    expect(b.loginAntigravity).toHaveBeenCalledOnce()
  })

  it('lists the ChatGPT accounts with their weekly quota and can trigger sign in and removal', () => {
    const b = bench({ status: 'ready' }, codexAccounts)
    fireEvent.click(screen.getByText(en.providerCodex))
    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByText('wk 76%')).toBeTruthy()
    expect(screen.getByText(en.accountCurrent)).toBeTruthy()
    const addButtons = screen.getAllByRole('button', { name: en.addAccount })
    fireEvent.click(addButtons[addButtons.length - 1]!)
    expect(b.loginCodex).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.accountRemove }))
    expect(screen.getByText(en.confirmDelete)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.confirmYes }))
    expect(b.removeCodexAccount).toHaveBeenCalledWith('work')
  })

  it('supports inline renaming for Codex accounts matching Antigravity experience', () => {
    const b = bench({ status: 'ready' }, codexAccounts)
    fireEvent.click(screen.getByText(en.providerCodex))
    const nameEl = screen.getByText('Work')
    fireEvent.click(nameEl)
    const input = screen.getByDisplayValue('Work')
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Work Account Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(b.renameCodexAccount).toHaveBeenCalledWith('work', 'Work Account Renamed')
  })

  it('expands Codex account card on click to reveal detailed quota balance', () => {
    bench({ status: 'ready' }, codexAccounts)
    fireEvent.click(screen.getByText(en.providerCodex))
    expect(screen.queryByText('Weekly')).toBeNull()
    const card = screen.getByRole('button', { name: en.quotaView })
    fireEvent.click(card)
    expect(screen.getByText('Weekly')).toBeTruthy()
    expect(screen.getByText('5h')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.quotaHide }))
    expect(screen.queryByText('Weekly')).toBeNull()
  })

  it('supports two-level navigation: level 1 provider overview and level 2 single-provider detail', () => {
    bench({ status: 'ready' }, codexAccounts)
    // Level 1: Displays multiple providers
    expect(screen.getByText(en.providerCodex)).toBeTruthy()
    expect(screen.getByText(en.providerAntigravity)).toBeTruthy()
    expect(screen.getByText(en.providerClaude)).toBeTruthy()
    expect(screen.getByText(en.providerOpenCode)).toBeTruthy()

    // Click "Manage" on the first provider (Antigravity) to enter Level 2
    const manageButtons = screen.getAllByRole('button', { name: new RegExp(en.providerManage) })
    expect(manageButtons.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(manageButtons[0]!)

    // Now in Level 2: Displays only Antigravity information
    expect(screen.getByTestId('provider-settings-detail')).toBeTruthy()
    expect(screen.getByText(new RegExp(en.backToProviders))).toBeTruthy()
    // Other providers like Claude or OpenCode should not be on this level 2 page
    expect(screen.queryByText(en.providerClaude)).toBeNull()
    expect(screen.queryByText(en.providerOpenCode)).toBeNull()

    // Click "Back to all providers" to return to Level 1
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.backToProviders) }))
    expect(screen.queryByTestId('provider-settings-detail')).toBeNull()
    expect(screen.getByTestId('provider-settings')).toBeTruthy()
    expect(screen.getByText(en.providerClaude)).toBeTruthy()
  })

  it('supports toggling model visibility switches and expanding quota', () => {
    bench({
      status: 'ready',
      accounts: [
        { id: 'acc1', label: 'Primary Account', email: 'acc1@gmail.com', active: true, tier: 'Pro' },
      ],
      view: { riskAcknowledged: true, login: { phase: 'success', configured: true, projectAvailable: true } },
      models: { state: 'live-available', models: [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', state: 'live-available' }] },
    })

    // Click Antigravity card head to expand provider
    fireEvent.click(screen.getByText(en.providerAntigravity))

    // Check account custom name and tier badge
    expect(screen.getByText('Primary Account')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()

    // The account card is collapsed by default; click to expand quota
    expect(screen.queryByText(en.quotaBalance)).toBeNull()
    const accountCard = screen.getByRole('button', { name: en.quotaView })
    fireEvent.click(accountCard)
    expect(screen.getByText(en.quotaBalance)).toBeTruthy()

    // Check that model checkbox is rendered and can be toggled
    const checkbox = screen.getByRole('checkbox', { name: '' })
    expect(checkbox).toBeTruthy()
    fireEvent.click(checkbox)

    // Clicking the card collapses the quota
    fireEvent.click(screen.getByRole('button', { name: en.quotaHide }))
    expect(screen.queryByText(en.quotaBalance)).toBeNull()
  })

  it('navigates to OpenCode settings and saves configuration', () => {
    bench({ status: 'ready' })
    expect(screen.getByText(en.providerOpenCode)).toBeTruthy()
    const manageButtons = screen.getAllByRole('button', { name: new RegExp(en.providerManage) })
    fireEvent.click(manageButtons[3]!)
    expect(screen.getByTestId('provider-settings-detail')).toBeTruthy()
    expect(screen.getByText(en.opencodeApiKey)).toBeTruthy()
    expect(screen.getByText(en.opencodeBaseUrl)).toBeTruthy()
    expect(screen.getByText(en.opencodeModels)).toBeTruthy()
    expect(screen.getByText('DeepSeek V4.1 Flash')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.opencodeSave }))
    expect(screen.getByText(en.opencodeSaved)).toBeTruthy()
  })
})
