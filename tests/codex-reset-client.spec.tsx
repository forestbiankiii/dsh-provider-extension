// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { CodexResetCredits } from '../src/client/usage/CodexResetCredits.tsx'
import { ProviderBalances } from '../src/client/usage/ProviderBalances.tsx'
import { en } from '../src/client/usage/locales.ts'
const t = (key: keyof typeof en, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(args?.[k] ?? ''))
const now = Date.parse('2026-10-11T10:00:00Z')
afterEach(() => { cleanup(); vi.useRealTimers() })
function fixture() {
  vi.useFakeTimers(); vi.setSystemTime(now)
  const onReset = vi.fn()
  const call = vi.fn(async (_ns: string, endpoint: string) => ({ ok: true, value: endpoint.endsWith('/inspect') ? { availableCount: 2, credits: [
    { ref: 'opaque-one', name: 'First reset', expiresAt: now + 3600000 }, { ref: 'opaque-two' },
  ] } : endpoint.endsWith('/prepare') ? { challengeId: 'opaque-confirmation', readyAt: now + 5000, expiresAt: now + 60000, creditExpiresAt: now + 3600000 } : { code: 'reset' } }))
  const props = { rpc: { call } as never, accountId: 'non-active', label: 'Gmail', availableCount: 2, t, locale: 'en-US', onReset }
  const view = render(<CodexResetCredits {...props} />)
  return { props, view, call, onReset }
}
async function click(button: HTMLElement) { await act(async () => { fireEvent.click(button) }) }
async function choose(f: ReturnType<typeof fixture>) {
  await click(screen.getByRole('button', { name: /View \/ use quota resets/ }))
  await click(screen.getAllByRole('button', { name: en.resetUse })[0]!)
}
describe('quota-reset card actions', () => {
  it('lists every expiry on read-only inspection and marks absent expiry unknown', async () => {
    const f = fixture()
    expect(f.call).not.toHaveBeenCalled()
    await click(screen.getByRole('button', { name: /View \/ use quota resets/ }))
    expect(screen.getByText(t('resetExpires', { time: new Date(now + 3600000).toLocaleString('en-US') }))).toBeTruthy()
    expect(screen.getByText(en.resetExpiryUnknown)).toBeTruthy()
    expect(screen.getByText('Reset credit 2')).toBeTruthy()
    expect(f.call).toHaveBeenCalledExactlyOnceWith('/api', 'codex-subscription/reset-credit/inspect', { id: 'non-active' }, expect.any(AbortSignal))
    expect(f.onReset).not.toHaveBeenCalled()
  })
  it('requires selecting a credit, acknowledgement and countdown before account-bound consumption', async () => {
    const f = fixture(); await choose(f)
    const confirm = () => screen.getByRole('button', { name: /Confirm in|Confirm use/ }) as HTMLButtonElement
    expect(confirm().disabled).toBe(true)
    await click(screen.getByRole('checkbox', { name: en.resetAcknowledge }))
    expect(confirm().disabled).toBe(true)
    await act(async () => { vi.advanceTimersByTime(5001) })
    expect(confirm().disabled).toBe(false)
    await click(confirm())
    const consume = f.call.mock.calls.filter(args => args[1].endsWith('/consume'))
    expect(consume).toHaveLength(1)
    expect(consume[0]).toEqual(['/api', 'codex-subscription/reset-credit/consume', { id: 'non-active', challengeId: 'opaque-confirmation', acknowledged: true }, expect.any(AbortSignal)])
    expect(f.onReset).toHaveBeenCalledOnce()
    expect(screen.getByText(en.resetSuccess)).toBeTruthy()
    expect(f.call.mock.calls.filter(args => args[1].endsWith('/inspect'))).toHaveLength(2)
    expect(f.call.mock.calls.some(args => args[1].includes('account/select'))).toBe(false)
  })
  it('cancelling and expired confirmations cannot consume a reset', async () => {
    const f = fixture(); await choose(f)
    await click(screen.getByRole('button', { name: en.resetCancel }))
    expect(f.call.mock.calls.some(args => args[1].endsWith('/consume'))).toBe(false)
    await click(screen.getAllByRole('button', { name: en.resetUse })[0]!)
    await click(screen.getByRole('checkbox', { name: en.resetAcknowledge }))
    await act(async () => { vi.advanceTimersByTime(60001) })
    expect((screen.getByRole('button', { name: en.resetConfirm }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(en.resetConfirmationExpired)).toBeTruthy()
    expect(f.onReset).not.toHaveBeenCalled()
  })
  it('uncertain outcomes retain the same confirmation and never auto-retry', async () => {
    const f = fixture(); await choose(f)
    await click(screen.getByRole('checkbox', { name: en.resetAcknowledge }))
    await act(async () => { vi.advanceTimersByTime(5001) })
    f.call.mockResolvedValueOnce({ ok: false, error: { message: 'uncertain' } } as never)
    await click(screen.getByRole('button', { name: en.resetConfirm }))
    expect(screen.getByRole('alert').textContent).toContain(en.resetUncertain)
    expect(f.call.mock.calls.filter(args => args[1].endsWith('/consume'))).toHaveLength(1)
    await click(screen.getByRole('button', { name: en.resetConfirm }))
    const consumes = f.call.mock.calls.filter(args => args[1].endsWith('/consume'))
    expect(consumes).toHaveLength(2)
    expect(consumes[0]![2]).toEqual(consumes[1]![2])
    expect(f.onReset).toHaveBeenCalledOnce()
  })
  it('coalesces repeated submission clicks and aborts a pending read on unmount', async () => {
    const f = fixture(); await choose(f)
    await click(screen.getByRole('checkbox', { name: en.resetAcknowledge }))
    await act(async () => { vi.advanceTimersByTime(5001) })
    let complete!: (value: unknown) => void
    f.call.mockImplementationOnce(() => new Promise(resolve => { complete = resolve as never }))
    const confirm = screen.getByRole('button', { name: en.resetConfirm })
    await act(async () => { fireEvent.click(confirm); fireEvent.click(confirm) })
    expect(f.call.mock.calls.filter(args => args[1].endsWith('/consume'))).toHaveLength(1)
    f.view.unmount()
    const last = f.call.mock.calls.at(-1) as unknown as unknown[]
    expect((last[3] as AbortSignal).aborted).toBe(true)
    await act(async () => { complete({ ok: true, value: { code: 'reset' } }) })
    expect(f.onReset).not.toHaveBeenCalled()
  })
  it('does not hide quota cards when reset details fail and offers actions only for exact Codex routes', async () => {
    vi.useRealTimers()
    const row = { provider: 'openai-codex', name: 'OpenAI Codex', accountId: 'personal', label: 'Personal', active: false, plan: 'PLUS', subscriptionUntil: null, status: 'ready' as const, checkedAt: now, windows: [], credits: null, unlimitedCredits: false, resetCredits: 3 }
    const call = vi.fn(async () => ({ ok: false, error: { message: 'offline' } }))
    render(<ProviderBalances providers={[row, { ...row, provider: 'external-openai-codex', label: 'External' }]} rpc={{ call } as never} locale="en-US" t={t} />)
    expect(screen.getAllByRole('button', { name: /View \/ use quota resets/ })).toHaveLength(1)
    await click(screen.getByRole('button', { name: /View \/ use quota resets/ }))
    expect(screen.getByRole('alert').textContent).toContain(en.resetFailed)
    expect(within(screen.getByRole('region', { name: 'OpenAI Codex Personal' })).getByText('Personal')).toBeTruthy()
  })
})
