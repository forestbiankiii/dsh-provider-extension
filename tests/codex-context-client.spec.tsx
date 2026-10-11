// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexContextSettings, requestCodexContext } from '../src/client/CodexContextSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
afterEach(cleanup)
const groups = [
  { key: 'large', label: 'Large Model', minimum: 128000, maximum: 1000000, default: 272000, fixed: false },
  { key: 'mini', label: 'Mini Model', minimum: 128000, maximum: 400000, default: 272000, fixed: false },
  { key: 'spark', label: 'Fixed Model', minimum: 128000, maximum: 128000, default: 128000, fixed: true },
]
function fixture(copy = en, writable = true, initialMode = 'standard') {
  let mode = initialMode
  let models: Record<string, number> = { archived: 200000 }
  const value = () => ({ contextMode: mode, customContextModels: { ...models }, contextWritable: writable, contextModels: groups.map(group => ({ ...group, effective: group.fixed || mode === 'standard' ? group.default : mode === 'extended' ? group.maximum : Math.min(models[group.key] ?? group.default, group.maximum) })) })
  const call = vi.fn(async (_namespace: string, endpoint: string, payload: { contextMode?: string; customContextModels?: Record<string, number> }) => {
    if (endpoint.endsWith('/update')) { mode = payload.contextMode ?? mode; models = { ...models, ...payload.customContextModels } }
    return { ok: true, value: value() }
  })
  let notify!: () => void
  const dispose = vi.fn()
  const t = (key: keyof typeof en, args?: Record<string, unknown>) => copy[key].replace(/\{(\w+)\}/g, (_, name) => String(args?.[name] ?? ''))
  const view = render(<CodexContextSettings rpc={{ call } as never} t={t} subscribe={listener => { notify = listener; return dispose }} />)
  const ready = () => waitFor(() => expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false))
  return { call, value, view, ready, dispose, notify: async () => { await act(async () => { notify() }) }, remoteMode: (next: string) => { mode = next } }
}

describe('Codex context settings', () => {
  it.each([en, zh])('reads saved host state, shows three localized modes and has no redundant Refresh control', async copy => {
    const f = fixture(copy)
    await f.ready()
    const select = screen.getByRole('combobox', { name: copy.codexContext }) as HTMLSelectElement
    expect([...select.options].map(option => option.textContent)).toEqual([copy.codexContextStandard, copy.codexContextExtended, copy.codexContextCustom])
    expect(screen.queryByRole('button', { name: copy.providerRefresh })).toBeNull()
    expect(f.call).toHaveBeenCalledOnce()
    fireEvent.change(select, { target: { value: 'extended' } })
    await f.ready()
    expect(select.value).toBe('extended')
    expect(f.call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { contextMode: 'extended' }, undefined)
    expect(screen.getByText(copy.codexContextSaved)).toBeTruthy()
    expect(screen.getByText('1,000,000 tokens')).toBeTruthy()
    expect(screen.getByText('128,000 tokens')).toBeTruthy()
  })
  it('saves only edited model sizes on explicit Save and does not submit every keystroke', async () => {
    const f = fixture(en, true, 'custom'); await f.ready()
    const input = screen.getByRole('spinbutton', { name: 'Mini Model' }) as HTMLInputElement
    expect(input.min).toBe('128000'); expect(input.max).toBe('400000')
    expect(screen.queryByRole('spinbutton', { name: /Fixed Model/ })).toBeNull()
    fireEvent.change(input, { target: { value: '300000' } })
    expect(f.call).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.codexContextSave }))
    await f.ready()
    expect(f.call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { contextMode: 'custom', customContextModels: { mini: 300000 } }, undefined)
    expect(f.value().customContextModels).toEqual({ archived: 200000, mini: 300000 })
  })
  it.each(['', '127999', '400001', '300000.5'])('disables Save for invalid custom input %s', async input => {
    const f = fixture(en, true, 'custom'); await f.ready()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Mini Model' }), { target: { value: input } })
    expect((screen.getByRole('button', { name: en.codexContextSave }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(en.codexContextInvalid)).toBeTruthy()
    expect(f.call).toHaveBeenCalledOnce()
  })
  it('preserves an unsaved draft across unrelated native config/model notifications and disposes the listener', async () => {
    const f = fixture(en, true, 'custom'); await f.ready()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Mini Model' }), { target: { value: '300000' } })
    await f.notify(); await f.ready()
    expect((screen.getByRole('spinbutton', { name: 'Mini Model' }) as HTMLInputElement).value).toBe('300000')
    f.view.unmount(); expect(f.dispose).toHaveBeenCalledOnce()
  })
  it('retains the old acknowledged mode and reports failures without false success or duplicate saves', async () => {
    const f = fixture(); await f.ready()
    let finish!: (value: unknown) => void
    f.call.mockImplementationOnce(() => new Promise(resolve => { finish = resolve as never }))
    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'extended' } })
    fireEvent.change(select, { target: { value: 'custom' } })
    expect(f.call).toHaveBeenCalledTimes(2)
    expect(select.value).toBe('standard')
    expect(screen.queryByText(en.codexContextSaved)).toBeNull()
    await f.notify(); expect(f.call).toHaveBeenCalledTimes(2)
    finish({ ok: false, error: { message: 'Save rejected' } })
    await screen.findByText('Save rejected')
    expect(select.value).toBe('standard')
    expect(screen.queryByText(en.codexContextSaved)).toBeNull()
  })
  it('shows read-only state without writes', async () => {
    const f = fixture(en, false)
    await screen.findByText(en.codexVerbosityReadOnly)
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
    expect(f.call).toHaveBeenCalledOnce()
  })
  it('rejects malformed model limits and non-acknowledged updates', async () => {
    const f = fixture(); await f.ready()
    const call = vi.fn().mockResolvedValueOnce({ ok: true, value: { ...f.value(), contextModels: [{ ...f.value().contextModels[0], effective: 1000001 }] } }).mockResolvedValueOnce({ ok: true, value: f.value() })
    await expect(requestCodexContext({ call } as never)).rejects.toThrow('Invalid Codex context model response')
    await expect(requestCodexContext({ call } as never, { contextMode: 'extended' })).rejects.toThrow('did not accept')
  })
})
