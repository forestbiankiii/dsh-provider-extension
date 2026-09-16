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
  const props = {
    useAccounts: (selector: (state: CodexAccountsState) => unknown) => selector(accounts),
    useAntigravity: (selector: (state: AntigravityState) => unknown) => selector(antigravity),
    loadAccounts,
    readQuota: vi.fn(async () => {}),
    loadAntigravity: vi.fn(async () => {}),
    loginAntigravity,
    logoutAntigravity: vi.fn(async () => {}),
    t: (key: keyof typeof en, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(args?.[name] ?? '')),
  } as unknown as ProviderSettingsProps
  const view = render(<ProviderSettings {...props} />)
  return { loadAccounts, loginAntigravity, view }
}

describe('provider settings surface', () => {
  it('reveals the provider catalog from the create button', () => {
    bench({ status: 'absent' })
    expect(screen.queryByTestId('provider-catalog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.createProvider }))
    expect(screen.getByTestId('provider-catalog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.providerCloseCatalog }))
    expect(screen.queryByTestId('provider-catalog')).toBeNull()
  })

  it('shows the install command when the companion bundle is absent', () => {
    bench({ status: 'absent' })
    expect(screen.getByText(/dsh-antigravity-auth@/)).toBeTruthy()
    expect(screen.getByText(en.providerNotInstalled)).toBeTruthy()
  })

  it('shows the signed-in account and its models, and starts a login on demand', () => {
    const b = bench({
      status: 'ready',
      view: { riskAcknowledged: true, login: { phase: 'success', configured: true, projectAvailable: true, maskedEmail: 'fo***@gmail.com' } },
      models: { state: 'live-available', models: [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', state: 'live-available' }] },
    })
    expect(screen.getByText(/fo\*\*\*@gmail\.com/)).toBeTruthy()
    expect(screen.getByText('Gemini 3.8 Flash')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.antigravitySignIn }))
    expect(b.loginAntigravity).toHaveBeenCalledOnce()
  })

  it('lists the ChatGPT accounts with their weekly quota and cannot sign in without the companion', () => {
    bench({ status: 'absent' }, codexAccounts)
    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByText('wk 76%')).toBeTruthy()
    expect(screen.getByText(en.accountActive)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.antigravitySignIn })).toBeNull()
  })
})
