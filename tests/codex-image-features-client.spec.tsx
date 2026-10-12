// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexImageFeaturesSettings, requestCodexImageFeatures } from '../src/client/CodexImageFeaturesSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
afterEach(cleanup)
const result = (imageGeneration = true, imageEditing = true, writable = true) => ({ ok: true, value: { imageGeneration, imageEditing, imageFeaturesWritable: writable, imageViewer: true } })
describe('Codex image tool availability controls', () => {
  it.each([en, zh])('loads and persists image generation/edit switches without invoking image tools', async copy => {
    let generation = true, editing = true
    const call = vi.fn(async (_channel: string, endpoint: string, payload: { imageGeneration?: boolean; imageEditing?: boolean }) => {
      if (endpoint.endsWith('/update')) { generation = payload.imageGeneration ?? generation; editing = payload.imageEditing ?? editing }
      return result(generation, editing)
    })
    render(<CodexImageFeaturesSettings rpc={{ call } as never} t={key => copy[key]} />)
    const generate = await screen.findByRole('switch', { name: copy.codexImageGeneration }) as HTMLInputElement
    const edit = screen.getByRole('switch', { name: copy.codexImageEditing }) as HTMLInputElement
    await waitFor(() => expect(generate.disabled).toBe(false))
    expect(generate.checked).toBe(true); expect(edit.checked).toBe(true)
    expect(screen.getByText(copy.codexImageFeaturesHint)).toBeTruthy()
    fireEvent.click(generate)
    await waitFor(() => expect(generate.disabled).toBe(false))
    expect(generate.checked).toBe(false); expect(edit.checked).toBe(true)
    expect(call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { imageGeneration: false }, undefined)
    fireEvent.click(edit)
    await waitFor(() => expect(edit.disabled).toBe(false))
    expect(edit.checked).toBe(false)
    expect(call).toHaveBeenLastCalledWith('/api', 'codex-subscription/preferences/update', { imageEditing: false }, undefined)
    expect(call.mock.calls.map(args => args[1])).toEqual(['codex-subscription/preferences/status', 'codex-subscription/preferences/update', 'codex-subscription/preferences/update'])
    expect(screen.getByText(copy.codexImageFeaturesSaved)).toBeTruthy()
  })
  it('shows read-only state and retains the previous switch value after a rejected write', async () => {
    const call = vi.fn().mockResolvedValueOnce(result(true, true)).mockResolvedValueOnce({ ok: false, error: { message: 'Host rejected setting' } })
    render(<CodexImageFeaturesSettings rpc={{ call } as never} t={key => en[key]} />)
    const generation = await screen.findByRole('switch', { name: en.codexImageGeneration }) as HTMLInputElement
    await waitFor(() => expect(generation.disabled).toBe(false))
    fireEvent.click(generation)
    expect(await screen.findByText('Host rejected setting')).toBeTruthy()
    expect(generation.checked).toBe(true)
    const readonlyCall = vi.fn(async () => result(true, false, false))
    cleanup()
    render(<CodexImageFeaturesSettings rpc={{ call: readonlyCall } as never} t={key => en[key]} />)
    await screen.findByText(en.codexVerbosityReadOnly)
    expect((screen.getByRole('switch', { name: en.codexImageEditing }) as HTMLInputElement).disabled).toBe(true)
    expect(readonlyCall).toHaveBeenCalledOnce()
  })
  it('rejects invalid patches and malformed acknowledgements', async () => {
    const call = vi.fn().mockResolvedValueOnce(result())
    await expect(requestCodexImageFeatures({ call } as never, {})).rejects.toThrow('Invalid Codex image settings')
    await expect(requestCodexImageFeatures({ call } as never, { imageGeneration: 'yes' as never })).rejects.toThrow('Invalid Codex image settings')
    const malformed = vi.fn().mockResolvedValueOnce({ ok: true, value: { imageGeneration: true, imageEditing: 'yes', imageFeaturesWritable: true } })
    await expect(requestCodexImageFeatures({ call: malformed } as never)).rejects.toThrow('Invalid Codex image settings response')
  })
})
