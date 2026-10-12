// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexContextSettings, requestCodexContext } from '../src/client/CodexContextSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
afterEach(cleanup)
const catalog = [
  { key: 'large', label: 'Large model', effective: 272000 },
  { key: 'mini', label: 'Mini model', effective: 272000 },
  { key: 'fixed', label: 'Fixed model', effective: 128000 },
]
function fixture(copy = en, writable = true, initialMode = 'standard') {
  let mode = initialMode, tokensK = 256
  const effective = () => catalog.map(model => ({ ...model, effective: model.key === 'mini' ? Math.min(mode === 'extended' ? 400000 : mode === 'custom' ? tokensK * 1000 : 272000, 400000) : model.key === 'fixed' ? 128000 : mode === 'extended' ? 1000000 : mode === 'custom' ? tokensK * 1000 : 272000 }))
  const response = () => ({ contextMode: mode, contextLengthK: tokensK, contextMaximumK: 1000, contextWritable: writable, contextModels: effective() })
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
  it.each([en, zh])('shows localized modes and the current actual capacity per model', async copy => {
    const f = fixture(copy); await f.ready()
    const trigger = screen.getByRole('combobox', { name: copy.codexContext }) as HTMLButtonElement
    expect(trigger.value).toBe('standard')
    expect(screen.getByText(copy.codexContextCapacities)).toBeTruthy()
    expect(screen.getByText('Large model')).toBeTruthy()
    expect(screen.getAllByText('272k')).toHaveLength(2)
    expect(screen.getByText('128k')).toBeTruthy()
    choose(copy.codexContext, copy.codexContextExtended)
    await f.ready()
    expect(trigger.value).toBe('extended')
    expect(screen.getByText('1,000k')).toBeTruthy()
    expect(screen.getByText('400k')).toBeTruthy()
    expect(f.call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { contextMode: 'extended' }, undefined)
  })
  it('edits one shared K value and shows per-model effective sizes without model-specific inputs', async () => {
    const f = fixture(en, true, 'custom'); await f.ready()
    const input = screen.getByRole('spinbutton', { name: en.codexContextSize }) as HTMLInputElement
    expect(input.value).toBe('256'); expect(input.min).toBe('128'); expect(input.max).toBe('1000')
    fireEvent.change(input, { target: { value: '600' } })
    expect(f.call).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.codexContextSave }))
    await f.ready()
    expect(f.call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { contextMode: 'custom', contextLengthK: 600 }, undefined)
    expect(f.response().contextLengthK).toBe(600)
    expect(screen.getByText('600k')).toBeTruthy()
    expect(screen.getByText('400k')).toBeTruthy()
    expect(screen.getByText('128k')).toBeTruthy()
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
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
  it('rejects malformed per-model capacities and non-acknowledged mode updates', async () => {
    const values = { contextMode: 'standard', contextLengthK: 256, contextMaximumK: 1000, contextWritable: true, contextModels: catalog }
    const call = vi.fn().mockResolvedValueOnce({ ok: true, value: { ...values, contextMode: 'extended' } })
    await expect(requestCodexContext({ call } as never, { contextMode: 'standard' })).rejects.toThrow('did not accept')
    const invalid = vi.fn().mockResolvedValueOnce({ ok: true, value: { ...values, contextModels: [{ ...catalog[0], effective: 16000001 }] } })
    await expect(requestCodexContext({ call: invalid } as never)).rejects.toThrow('Invalid Codex context model response')
  })
})
