// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { ModelPanel, type ModelPanelProps } from '../src/client/ModelPanel.tsx'
import { en } from '../src/client/locales.ts'
afterEach(cleanup)
function bench(options: { fail?: boolean; empty?: boolean } = {}) {
  const state: ModelDirectoryState = { current: { provider: 'a', model: 'sol', reasoningEffort: 'high' }, routable: true,
    groups: options.empty ? [] : [{ id: 'a', name: 'Fixture', models: [
      { id: 'sol', name: 'Sol', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } },
      { id: 'plain', name: 'Plain' },
    ] }], status: 'ready', error: null, failures: [] }
  const select = vi.fn(async () => { if (options.fail) throw new Error('rejected') })
  const loadDirectory = vi.fn(async () => {})
  const props = { useDirectory: (selector: (s: ModelDirectoryState) => unknown) => selector(state), select, loadDirectory,
    t: (key: keyof typeof en, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(args?.[k] ?? '')) } as unknown as ModelPanelProps
  const view = render(<ModelPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: en.title }))
  return { select, loadDirectory, view }
}
describe('model panel component', () => {
  it('opens, loads and shows an honest unsupported-context notice', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.contextUnsupported)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '1M' })).toBeNull()
    fireEvent.keyDown(screen.getByTestId('dshx-model-panel'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('selects models without reasoning and submits no unknown fields', async () => {
    const b = bench()
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Select Plain' }))
    await waitFor(() => expect(b.select).toHaveBeenCalledWith({ provider: 'a', model: 'plain' }))
  })
  it('reports rejection and restores the slider to authoritative state', async () => {
    const b = bench({ fail: true })
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('rejected'))
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('1')
  })
  it('shows an empty catalog rather than permanent loading', async () => {
    const b = bench({ empty: true })
    await waitFor(() => expect(b.loadDirectory).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByText(en.empty)).toBeTruthy())
  })
  it('closes on outside click', () => {
    bench()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
