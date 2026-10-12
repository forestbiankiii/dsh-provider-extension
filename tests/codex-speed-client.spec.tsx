// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexSpeedSettings, requestCodexSpeed } from '../src/client/CodexSpeedSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
afterEach(cleanup)
function response(speedMode = 'standard', fastModels: string[] = ['gpt-6.1-sol'], writable = true) {
  return { ok: true, value: { speedMode, speedModeWritable: writable, fastModels, searchMode: 'untouched', reasoningEffort: 'high' } }
}
describe('Codex Standard/Fast control and RPC', () => {
  it.each([en, zh])('loads and saves localized choices through the same preference endpoint', async copy => {
    let current = 'standard'
    const call = vi.fn(async (_ns: string, endpoint: string, payload: { speedMode?: string }) => {
      if (endpoint.endsWith('/update')) current = payload.speedMode!
      return response(current)
    })
    render(<CodexSpeedSettings rpc={{ call } as never} t={key => copy[key]} />)
    const select = await screen.findByRole('combobox', { name: copy.codexSpeed }) as HTMLButtonElement
    await waitFor(() => expect(select.disabled).toBe(false))
    expect(call).toHaveBeenCalledOnce()
    fireEvent.click(select); fireEvent.click(screen.getByRole('option', { name: copy.codexSpeedFast }))
    await waitFor(() => expect(select.disabled).toBe(false))
    expect(select.value).toBe('fast')
    expect(call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { speedMode: 'fast' }, undefined)
    expect(screen.getByText(copy.codexSpeedSaved)).toBeTruthy()
  })
  it('keeps acknowledgement until save returns, blocks duplicates, and shows failure', async () => {
    const call = vi.fn().mockResolvedValueOnce(response()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve as never }))
    let finish!: (value: unknown) => void
    render(<CodexSpeedSettings rpc={{ call } as never} t={key => en[key]} />)
    const select = await screen.findByRole('combobox') as HTMLButtonElement
    await waitFor(() => expect(select.disabled).toBe(false))
    fireEvent.click(select); fireEvent.click(screen.getByRole('option', { name: en.codexSpeedFast }))
    expect(select.disabled).toBe(true)
    expect(call).toHaveBeenCalledTimes(2)
    expect(select.value).toBe('standard')
    finish({ ok: false, error: { message: 'Write failed' } })
    await screen.findByText('Write failed')
    expect(select.value).toBe('standard')
    expect(screen.queryByText(en.codexSpeedSaved)).toBeNull()
  })
  it('calls out an empty Fast-capable catalog without disabling the persisted preference', async () => {
    const call = vi.fn(async () => response('standard', [], true))
    render(<CodexSpeedSettings rpc={{ call } as never} t={key => en[key]} />)
    await screen.findByText(en.codexSpeedUnsupported)
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(false)
    expect(call).toHaveBeenCalledOnce()
  })
  it('shows read-only state and validates malformed or unacknowledged responses', async () => {
    const call = vi.fn(async () => response('standard', ['gpt-6.1-sol'], false))
    render(<CodexSpeedSettings rpc={{ call } as never} t={key => en[key]} />)
    await screen.findByText(en.codexVerbosityReadOnly)
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true)
    const bad = vi.fn().mockResolvedValueOnce(response('warp'))
    await expect(requestCodexSpeed({ call: bad } as never)).rejects.toThrow('Invalid Codex speed mode response')
    const noAck = vi.fn().mockResolvedValueOnce(response('standard'))
    await expect(requestCodexSpeed({ call: noAck } as never, 'fast')).rejects.toThrow('did not accept')
    await expect(requestCodexSpeed({ call: noAck } as never, 'ultrafast' as never)).rejects.toThrow('Invalid Codex speed mode preference')
  })
})
