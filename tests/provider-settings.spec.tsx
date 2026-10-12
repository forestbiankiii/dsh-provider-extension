// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderSettings, type ProviderSettingsProps } from '../src/client/ProviderSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
import type { AntigravityState } from '../src/client/providers/antigravity.ts'
import type { CodexAccountsState } from '../src/client/providers/codex.ts'
import { codexEnabledModels } from '../src/client/codex-visibility.ts'
import settingsCss from '../src/client/ProviderSettings.module.css'
import resetCss from '../src/client/usage/UsagePage.module.css'
import { en as resetEn } from '../src/client/usage/locales.ts'

afterEach(() => { cleanup(); localStorage.clear() })

const emptyAccounts: CodexAccountsState = { status: 'ready', error: null, accounts: [], usage: {}, restoreFailed: false }
const codexAccounts: CodexAccountsState = {
  status: 'ready', error: null, restoreFailed: false,
  accounts: [{ id: 'work', label: 'Work', email: 'work@example.com', active: true }],
  usage: { work: { status: 'ready', value: { weeklyPercent: 76 } } },
}

function bench(antigravity: AntigravityState, accounts: CodexAccountsState = emptyAccounts, catalogLoader?: (accountId: string) => Promise<readonly { id: string; name: string }[]>, codexReset?: ProviderSettingsProps['codexReset'], codexVerbosity?: ProviderSettingsProps['codexVerbosity'], codexContext?: ProviderSettingsProps['codexContext']) {
  const loadAccounts = vi.fn(async () => {})
  const refreshAntigravityModels = vi.fn(async () => {})
  const loadCodexModels = catalogLoader ?? vi.fn(async () => [{ id: 'host-model', name: 'Host Model' }, { id: 'gpt-6-astra', name: 'GPT-6 Astra' }])
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
    loadCodexModels,
    ...(codexReset ? { codexReset } : {}),
    ...(codexVerbosity ? { codexVerbosity } : {}),
    ...(codexContext ? { codexContext } : {}),
    readQuota: vi.fn(async () => {}),
    loginCodex,
    renameCodexAccount,
    removeCodexAccount,
    loadAntigravity: vi.fn(async () => {}),
    refreshAntigravityModels,
    loginAntigravity,
    logoutAntigravity: vi.fn(async () => {}),
    renameAntigravityAccount,
    readAntigravityQuota,
    selectAntigravityAccount,
    t: (key: keyof typeof en, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(args?.[name] ?? '')),
  } as unknown as ProviderSettingsProps
  const view = render(<ProviderSettings {...props} />)
  return { loadAccounts, loadCodexModels, refreshAntigravityModels, loginAntigravity, loginCodex, renameCodexAccount, removeCodexAccount, renameAntigravityAccount, readAntigravityQuota, view }
}

describe('provider settings surface', () => {
  it.each(['quick', 'detail'])('preserves unsaved context input and supports keyboard tab navigation in %s', async mode => {
    const call = vi.fn(async () => ({ ok: true, value: { contextMode: 'custom', customContextModels: {}, contextWritable: true, contextModels: [{ key: 'draft', label: 'Draft Model', minimum: 128000, maximum: 1000000, default: 272000, effective: 272000, fixed: false }] } }))
    bench({ status: 'ready' }, codexAccounts, undefined, undefined, undefined, { rpc: { call } as never })
    if (mode === 'quick') fireEvent.click(screen.getByText(en.providerCodex))
    else fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[1]!)
    const accounts = screen.getByRole('tab', { name: en.codexManageAccounts })
    const settings = screen.getByRole('tab', { name: en.codexManageSettings })
    accounts.focus(); fireEvent.keyDown(accounts, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(settings)
    const input = await screen.findByRole('spinbutton', { name: 'Draft Model' }) as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { value: '600000' } })
    fireEvent.keyDown(settings, { key: 'Home' })
    expect(document.activeElement).toBe(accounts)
    expect(screen.queryByRole('spinbutton', { name: 'Draft Model' })).toBeNull()
    fireEvent.keyDown(accounts, { key: 'End' })
    expect(screen.getByRole('spinbutton', { name: 'Draft Model' })).toBe(input)
    expect(input.value).toBe('600000')
    expect(call).toHaveBeenCalledOnce()
    expect(call.mock.calls[0]![1]).toBe('codex-subscription/preferences/status')
  })
  it.each(['quick', 'detail'])('switches between account and settings management in %s without duplicate controls', async mode => {
    const call = vi.fn(async () => ({ ok: true, value: { outputVerbosity: 'medium', outputVerbosityWritable: true, contextMode: 'standard', customContextModels: {}, contextModels: [], contextWritable: true } }))
    bench({ status: 'ready' }, codexAccounts, undefined, undefined, { rpc: { call } as never }, { rpc: { call } as never })
    if (mode === 'quick') fireEvent.click(screen.getByText(en.providerCodex))
    else fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[1]!)
    const accountTab = screen.getByRole('tab', { name: en.codexManageAccounts })
    const settingsTab = screen.getByRole('tab', { name: en.codexManageSettings })
    expect(accountTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').id).toBe(accountTab.getAttribute('aria-controls'))
    expect(screen.queryByRole('combobox', { name: en.codexVerbosity })).toBeNull()
    fireEvent.click(settingsTab)
    const verbosity = await screen.findByRole('combobox', { name: en.codexVerbosity })
    await waitFor(() => expect((verbosity as HTMLSelectElement).value).toBe('medium'))
    expect(screen.getByRole('combobox', { name: en.codexContext })).toBeTruthy()
    expect(screen.getByRole('tabpanel').id).toBe(settingsTab.getAttribute('aria-controls'))
    expect(screen.queryByText('Work')).toBeTruthy() // kept mounted, but in the hidden account panel
    expect(screen.queryByRole('button', { name: en.quotaView })).toBeNull()
    expect(screen.queryByRole('button', { name: en.addAccount })).toBeNull()
    expect(settingsTab.getAttribute('aria-selected')).toBe('true')
    const reads = call.mock.calls.length
    fireEvent.click(accountTab)
    expect(screen.queryByRole('combobox', { name: en.codexContext })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.quotaView }))
    expect(await screen.findByRole('checkbox', { name: 'Host Model' })).toBeTruthy()
    fireEvent.click(settingsTab)
    expect(screen.getByRole('combobox', { name: en.codexVerbosity })).toBe(verbosity)
    expect(call.mock.calls.length).toBe(reads)
  })
  it.each(['quick', 'detail'])('exposes context length once in the %s provider settings', async mode => {
    const call = vi.fn(async () => ({ ok: true, value: { contextMode: 'standard', customContextModels: {}, contextModels: [], contextWritable: true } }))
    bench({ status: 'ready' }, codexAccounts, undefined, undefined, undefined, { rpc: { call } as never })
    if (mode === 'quick') fireEvent.click(screen.getByText(en.providerCodex))
    else fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[1]!)
    fireEvent.click(screen.getByRole('tab', { name: en.codexManageSettings }))
    const select = await screen.findByRole('combobox', { name: en.codexContext }) as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))
    expect(screen.getAllByRole('combobox', { name: en.codexContext })).toHaveLength(1)
    expect(call).toHaveBeenCalledOnce()
  })
  it.each(['quick', 'detail'])('exposes response detail once per Codex provider, not per account, in %s settings', async mode => {
    const call = vi.fn(async () => ({ ok: true, value: { outputVerbosity: 'medium', outputVerbosityWritable: true } }))
    bench({ status: 'ready' }, codexAccounts, undefined, undefined, { rpc: { call } as never })
    if (mode === 'quick') fireEvent.click(screen.getByText(en.providerCodex))
    else fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[1]!)
    fireEvent.click(screen.getByRole('tab', { name: en.codexManageSettings }))
    const select = await screen.findByRole('combobox', { name: en.codexVerbosity }) as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('medium'))
    expect(screen.getAllByRole('combobox', { name: en.codexVerbosity })).toHaveLength(1)
    expect(call).toHaveBeenCalledOnce()
  })
  it.each(['quick', 'detail'])('keeps model switches but removes custom default-model controls in %s settings', async mode => {
    bench({ status: 'ready' }, codexAccounts)
    if (mode === 'quick') fireEvent.click(screen.getByText(en.providerCodex))
    else fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[1]!)
    fireEvent.click(screen.getByRole('button', { name: en.quotaView }))
    expect(await screen.findByRole('checkbox', { name: 'Host Model' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /default for new conversations|Set default|设为默认/i })).toBeNull()
    expect(screen.queryByText('DSH default model')).toBeNull()
  })
  it.each(['quick', 'detail'])('puts the reset credit panel below quota as a full-width sibling in %s settings', async mode => {
    const call = vi.fn(async () => ({ ok: true, value: { availableCount: 3, credits: [{ ref: 'one', name: 'Full reset (Weekly + 5 hr)', expiresAt: Date.now() + 3600000 }] } }))
    const t = (key: keyof typeof resetEn, args?: Record<string, unknown>) => resetEn[key].replace(/\{(\w+)\}/g, (_, k: string) => String(args?.[k] ?? ''))
    const state: CodexAccountsState = { ...codexAccounts, usage: { work: { status: 'ready', value: { weeklyPercent: 76, resetCredits: 3 } } } }
    bench({ status: 'ready' }, state, undefined, { rpc: { call } as never, t, locale: 'en-US' })
    if (mode === 'quick') fireEvent.click(screen.getByText(en.providerCodex))
    else fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[1]!)
    fireEvent.click(screen.getByRole('button', { name: en.quotaView }))
    const button = await screen.findByRole('button', { name: /View \/ use quota resets/ })
    const panel = button.closest(`.${resetCss.resetCredits}`)!
    expect(panel.parentElement!.classList.contains(settingsCss.cockpitPanel)).toBe(true)
    expect(panel.closest(`.${settingsCss.cockpitSubRow}`)).toBeNull()
    expect(panel.previousElementSibling!.classList.contains(settingsCss.cockpitQuotaSection)).toBe(true)
    fireEvent.click(button)
    expect(await screen.findByText(resetEn.resetFullQuota)).toBeTruthy()
    expect(screen.getByText('Team Name:')).toBeTruthy()
    expect(call.mock.calls.length).toBe(1)
  })

  it('uses locally bundled official marks and a brand identity on every provider card', () => {
    const { view } = bench({ status: 'ready' }, codexAccounts)
    const cards = view.container.querySelectorAll('article[data-provider]')
    expect([...cards].map(card => card.getAttribute('data-provider'))).toEqual(['antigravity', 'codex', 'claude', 'opencode'])
    for (const card of cards) {
      const icon = card.querySelector('div[data-provider]')!
      expect(icon.textContent).toBe('')
      const mark = icon.querySelector('svg, img')!
      expect(mark.getAttribute('aria-hidden')).toBe('true')
      if (mark.tagName.toLowerCase() === 'img') {
        expect(mark.getAttribute('alt')).toBe('')
        const src = mark.getAttribute('src')!
        expect(src.startsWith('data:image/svg+xml,')).toBe(true)
        const svg = decodeURIComponent(src.slice('data:image/svg+xml,'.length))
        expect(svg).toContain('fill="#3186FF"')
        expect(svg).not.toMatch(/<script|<foreignObject|(?:href|src)=["']https?:\/\//i)
        expect(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')).toBeNull()
      } else {
        expect(mark.querySelector('path')).toBeTruthy()
        expect(mark.getAttribute('focusable')).toBe('false')
      }
    }
    expect(cards[1]!.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 180 180')
    expect(cards[2]!.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 248 248')
    expect(cards[3]!.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 16 20')
  })
  it('keeps provider names parallel in both locales and all settings views', () => {
    for (const copy of [en, zh]) {
      expect(copy.providerCodex).toBe('OpenAI Codex')
      expect(copy.providerAntigravity).toBe('Google Antigravity')
      expect(copy.providerClaude).toBe('Anthropic Claude')
    }
    bench({ status: 'ready' }, codexAccounts)
    expect(screen.getByText('OpenAI Codex')).toBeTruthy()
    expect(screen.getByText('Google Antigravity')).toBeTruthy()
    fireEvent.click(screen.getByText('OpenAI Codex'))
    expect(screen.getByText('OpenAI Codex')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[1]!)
    expect(screen.getAllByText('OpenAI Codex').length).toBeGreaterThan(1)
    expect(screen.queryByText('ChatGPT subscription')).toBeNull()
  })
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

  it('fetches Antigravity models from the provider overview action', () => {
    const b = bench({
      status: 'ready',
      view: { riskAcknowledged: true, login: { phase: 'success', configured: true, projectAvailable: true } },
    })
    fireEvent.click(screen.getByText(en.providerAntigravity))
    fireEvent.click(screen.getByRole('button', { name: en.antigravityFetchModels }))
    expect(b.refreshAntigravityModels).toHaveBeenCalledOnce()
  })

  it.each(['quick', 'detail'])('re-fetches the active Codex model list in %s settings', async (mode) => {
    const b = bench({ status: 'ready' }, codexAccounts)
    if (mode === 'quick') fireEvent.click(screen.getByText(en.providerCodex))
    else fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[1]!)
    fireEvent.click(screen.getByRole('button', { name: en.quotaView }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Host Model' })).toBeTruthy())
    const accountLoads = b.loadAccounts.mock.calls.length
    b.loadCodexModels.mockResolvedValue([{ id: 'gpt-6-sol', name: 'GPT-6 Sol' }])
    fireEvent.click(screen.getByRole('button', { name: en.codexFetchModels }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'GPT-6 Sol' })).toBeTruthy())
    expect(b.loadCodexModels).toHaveBeenCalledTimes(2)
    expect(b.loadAccounts).toHaveBeenCalledTimes(accountLoads)
    expect(screen.queryByRole('checkbox', { name: 'Host Model' })).toBeNull()
  })

  it('re-fetches Antigravity models from its detail view', () => {
    const b = bench({
      status: 'ready',
      view: { riskAcknowledged: true, login: { phase: 'success', configured: true, projectAvailable: true } },
    })
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[0]!)
    fireEvent.click(screen.getByRole('button', { name: en.antigravityFetchModels }))
    expect(b.refreshAntigravityModels).toHaveBeenCalledOnce()
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

  it.each(['quick', 'detail'])('uses the Host catalog and account-specific whitelist in %s settings', async (mode) => {
    bench({ status: 'ready' }, codexAccounts)
    if (mode === 'quick') fireEvent.click(screen.getByText(en.providerCodex))
    else fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[1]!)
    fireEvent.click(screen.getByRole('button', { name: en.quotaView }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Host Model' })).toBeTruthy())
    expect(screen.queryByRole('checkbox', { name: 'GPT-6 Sol' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Host Model' }))
    expect([...codexEnabledModels('work')!]).toEqual(['gpt-6-astra'])
    expect(codexEnabledModels('personal')).toBeUndefined()
    expect((screen.getByRole('checkbox', { name: 'Host Model' }) as HTMLInputElement).checked).toBe(false)
  })

  it('configures both accounts’ own model catalogs at once without switching', async () => {
    const loader = vi.fn(async (accountId: string) => [{ id: `${accountId}-model`, name: `${accountId} Model` }])
    bench({ status: 'ready' }, {
      ...codexAccounts,
      accounts: [
        { id: 'work', label: 'Work', email: 'work@example.com', active: true },
        { id: 'personal', label: 'Personal', email: 'personal@example.com', active: false },
      ],
    }, loader)
    fireEvent.click(screen.getByText(en.providerCodex))
    for (const button of screen.getAllByRole('button', { name: en.quotaView })) fireEvent.click(button)
    expect(await screen.findByRole('checkbox', { name: 'work Model' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'personal Model' })).toBeTruthy()
    expect(loader.mock.calls.map(call => call[0]).sort()).toEqual(['personal', 'work'])
    // Each account keeps its own switches; toggling one never touches the other.
    fireEvent.click(screen.getByRole('checkbox', { name: 'personal Model' }))
    expect([...codexEnabledModels('personal')!]).toEqual([])
    expect(codexEnabledModels('work')).toBeUndefined()
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
