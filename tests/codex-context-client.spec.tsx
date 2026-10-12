// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexContextSettings, requestCodexContext } from '../src/client/CodexContextSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
afterEach(cleanup)
function fixture(copy = en, writable = true, initialMode = 'standard') {
  let mode = initialMode, tokensK = 256
  const response = () => ({ contextMode: mode, contextLengthK: tokensK, contextMaximumK: 1000, contextWritable: writable })
  const call = vi.fn(async (_namespace: string, endpoint: string, payload: { contextMode?: string; contextLengthK?: number }) => {
    if (endpoint.endsWith('/update')) { mode = payload.contextMode ?? mode; tokensK = payload.contextLengthK ?? tokensK }
    return { ok: true, value: response() }
  })
  let notify!: () => void
  const dispose = vi.fn()
  const t = (key: keyof typeof en, args?: Record<string, unknown>) => copy[key].replace(/\{(\w+)\}/g, (_, name) => String(args?.[name] ?? ''))
  const view = render(<CodexContextSettings rpc={{ call } as never} t={t} subscribe={listener => { notify = listener; return dispose }} />)
  const ready = () => waitFor(() => expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(false))
  return { call, response, view, ready, dispose, notify: async () => { await act(async () => { notify() }) }, setRemote: (nextMode: string, nextSize = tokensK) => { mode = nextMode; tokensK = nextSize } }
}
function choose(name: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name }))
  fireEvent.click(screen.getByRole('option', { name: option }))
}
describe('Codex unified context setting', () => {
  it.each([en, zh])('shows three localized modes and saves the selected mode', async copy => {
    const f = fixture(copy); await f.ready()
    const trigger = screen.getByRole('combobox', { name: copy.codexContext }) as HTMLButtonElement
    expect(trigger.value).toBe('standard')
    expect(screen.queryByRole('button', { name: copy.providerRefresh })).toBeNull()
    choose(copy.codexContext, copy.codexContextExtended)
    await f.ready()
    expect(trigger.value).toBe('extended')
    expect(f.call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { contextMode: 'extended' }, undefined)
    expect(screen.getByText(copy.codexContextSaved)).toBeTruthy()
  })
  it('edits and saves one shared integer K value', async () => {
    const f = fixture(en, true, 'custom'); await f.ready()
    const input = screen.getByRole('spinbutton', { name: en.codexContextSize }) as HTMLInputElement
    expect(input.value).toBe('256'); expect(input.min).toBe('128'); expect(input.max).toBe('1000')
    fireEvent.change(input, { target: { value: '600' } })
    expect(f.call).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.codexContextSave }))
    await f.ready()
    expect(f.call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { contextMode: 'custom', contextLengthK: 600 }, undefined)
    expect(f.response().contextLengthK).toBe(600)
    expect(screen.getByText(/600k/)).toBeTruthy()
  })
  it.each(['', '127', '1001', '300.5'])('blocks an invalid shared K value: %s', async draft => {
    const f = fixture(en, true, 'custom'); await f.ready()
    fireEvent.change(screen.getByRole('spinbutton', { name: en.codexContextSize }), { target: { value: draft } })
    expect((screen.getByRole('button', { name: en.codexContextSave }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(en.codexContextInvalid.replace('{maximum}', '1000'))).toBeTruthy()
    expect(f.call).toHaveBeenCalledOnce()
  })
  it('preserves unsaved unified K draft after unrelated native configuration notifications', async () => {
    const f = fixture(en, true, 'custom'); await f.ready()
    const input = screen.getByRole('spinbutton', { name: en.codexContextSize }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '512' } })
    await f.notify(); await f.ready()
    expect(input.value).toBe('512')
    f.view.unmount(); expect(f.dispose).toHaveBeenCalledOnce()
  })
  it('retains the acknowledged mode and reports a rejected save', async () => {
    const f = fixture(); await f.ready()
    let finish!: (value: unknown) => void
    f.call.mockImplementationOnce(() => new Promise(resolve => { finish = resolve as never }))
    const trigger = screen.getByRole('combobox', { name: en.codexContext }) as HTMLButtonElement
    choose(en.codexContext, en.codexContextExtended)
    expect(f.call).toHaveBeenCalledTimes(2)
    expect(trigger.value).toBe('standard')
    finish({ ok: false, error: { message: 'Save rejected' } })
    await screen.findByText('Save rejected')
    expect(trigger.value).toBe('standard')
  })
  it('shows read-only state without writes', async () => {
    const f = fixture(en, false)
    await screen.findByText(en.codexVerbosityReadOnly)
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true)
    expect(f.call).toHaveBeenCalledOnce()
  })
  it('validates model-capped context response and verifies save acknowledgement', async () => {
    const call = vi.fn().mockResolvedValueOnce({ ok: true, value: { contextMode: 'standard', contextLengthK: 256, contextMaximumK: 1000, contextWritable: true } }).mockResolvedValueOnce({ ok: true, value: { contextMode: 'extended', contextLengthK: 256, contextMaximumK: 1000, contextWritable: true } })
    await expect(requestCodexContext({ call } as never, { contextMode: 'extended' })).rejects.toThrow('did not accept')
    const invalid = vi.fn().mockResolvedValueOnce({ ok: true, value: { contextMode: 'custom', contextLengthK: 1001, contextMaximumK: 1000, contextWritable: true } })
    await expect(requestCodexContext({ call: invalid } as never)).rejects.toThrow('Invalid Codex context settings response')
  })
})
