// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexVerbositySettings, requestCodexVerbosity } from '../src/client/CodexVerbositySettings.tsx'
import { en, zh } from '../src/client/locales.ts'
afterEach(cleanup)
function fixture(copy = en, writable = true) {
  let value = 'default'
  const call = vi.fn(async (_namespace: string, endpoint: string, payload: unknown) => {
    if (endpoint.endsWith('/update')) value = (payload as { outputVerbosity: string }).outputVerbosity
    return { ok: true, value: { outputVerbosity: value, outputVerbosityWritable: writable, searchProvider: 'untouched' } }
  })
  let notify!: () => void
  const dispose = vi.fn()
  const view = render(<CodexVerbositySettings rpc={{ call } as never} t={key => copy[key]} subscribe={listener => { notify = listener; return dispose }} />)
  return { call, view, dispose, notify: () => notify(), setRemote: (next: string) => { value = next } }
}

describe('Codex response detail control', () => {
  it.each([en, zh])('shows exactly four localized choices and sends only the confirmed preference', async copy => {
    const f = fixture(copy)
    const select = screen.getByRole('combobox', { name: copy.codexVerbosity }) as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))
    expect([...select.options].map(option => option.textContent)).toEqual([copy.codexVerbosityDefault, copy.codexVerbosityLow, copy.codexVerbosityMedium, copy.codexVerbosityHigh])
    expect(f.call).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: copy.providerRefresh })).toBeNull()
    for (const value of ['low', 'medium', 'high', 'default']) {
      fireEvent.change(select, { target: { value } })
      await waitFor(() => expect(select.disabled).toBe(false))
      expect(select.value).toBe(value)
      expect(f.call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { outputVerbosity: value }, undefined)
      expect(screen.getByText(copy.codexVerbositySaved)).toBeTruthy()
    }
  })
  it('retains the acknowledged value, blocks duplicate submissions, and does not claim success before the save returns', async () => {
    const f = fixture()
    const select = screen.getByRole('combobox', { name: en.codexVerbosity }) as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))
    let finish!: (value: unknown) => void
    f.call.mockImplementationOnce(() => new Promise(resolve => { finish = resolve as never }))
    fireEvent.change(select, { target: { value: 'high' } })
    fireEvent.change(select, { target: { value: 'low' } })
    expect(f.call).toHaveBeenCalledTimes(2)
    expect(select.value).toBe('default')
    expect(screen.queryByText(en.codexVerbositySaved)).toBeNull()
    finish({ ok: false, error: { message: 'Native save failed' } })
    expect(await screen.findByText('Native save failed')).toBeTruthy()
    expect(select.value).toBe('default')
    expect(screen.queryByText(en.codexVerbositySaved)).toBeNull()
  })
  it('shows read-only state without exposing a write', async () => {
    const f = fixture(en, false)
    await screen.findByText(en.codexVerbosityReadOnly)
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
    expect(f.call).toHaveBeenCalledOnce()
  })
  it('re-reads external configuration changes and disposes its subscription on close', async () => {
    const f = fixture()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))
    f.setRemote('low'); f.notify()
    await waitFor(() => expect(select.value).toBe('low'))
    f.view.unmount(); expect(f.dispose).toHaveBeenCalledOnce()
  })
  it('shows initial failures and re-reads on reopening without a separate refresh button', async () => {
    const call = vi.fn().mockResolvedValueOnce({ ok: false, error: { message: 'offline' } }).mockResolvedValueOnce({ ok: true, value: { outputVerbosity: 'medium', outputVerbosityWritable: true } })
    const view = render(<CodexVerbositySettings rpc={{ call } as never} t={key => en[key]} />)
    await screen.findByText('offline')
    expect(screen.queryByRole('button', { name: en.providerRefresh })).toBeNull()
    view.unmount()
    render(<CodexVerbositySettings rpc={{ call } as never} t={key => en[key]} />)
    await waitFor(() => expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('medium'))
  })
  it('rejects malformed or non-acknowledged responses instead of using browser-only state', async () => {
    const call = vi.fn().mockResolvedValueOnce({ ok: true, value: { outputVerbosity: 'invalid', outputVerbosityWritable: true } }).mockResolvedValueOnce({ ok: true, value: { outputVerbosity: 'default', outputVerbosityWritable: true } })
    await expect(requestCodexVerbosity({ call } as never)).rejects.toThrow('Invalid Codex response detail response')
    await expect(requestCodexVerbosity({ call } as never, 'high')).rejects.toThrow('did not accept')
  })
})
