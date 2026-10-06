// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ClaudeSettings } from '../src/client/ClaudeSettings.tsx'
import { ClaudeController, claudeEnabledModels } from '../src/client/providers/claude.ts'
import { en } from '../src/client/locales.ts'
import { ProviderSettings } from '../src/client/ProviderSettings.tsx'
const t = (key: keyof typeof en, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(args?.[name] ?? ''))
afterEach(() => { cleanup(); localStorage.clear() })
it('replaces the roadmap with CLI login controls and independent Claude model switches', async () => {
  const load = vi.fn(async () => {}), login = vi.fn(async () => {})
  render(<ClaudeSettings state={{ status: 'ready', label: 'sy***@example.com', plan: 'MAX', authMethod: 'claude.ai', errorCode: null, loginStarted: false }} load={load} login={login} loadModels={async () => [{ id: 'sonnet', name: 'Claude Sonnet' }, { id: 'opus', name: 'Claude Opus' }]} t={t} />)
  expect(screen.getByText('sy***@example.com')).toBeTruthy()
  expect(screen.getByText(en.claudeCliQuotaUnavailable)).toBeTruthy()
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Claude Sonnet' }))
  expect([...claudeEnabledModels()!]).toEqual(['opus'])
  fireEvent.click(screen.getByRole('button', { name: en.claudeCliLogin }))
  expect(login).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: en.claudeCliRefresh }))
  expect(load).toHaveBeenCalledTimes(2)
  expect(screen.queryByText(en.roadmapNotice)).toBeNull()
})
it('shows the same working Claude settings inside the provider hub and detail view', async () => {
  const load = vi.fn(async () => {}), login = vi.fn(async () => {}), models = vi.fn(async () => [{ id: 'sonnet', name: 'Claude Sonnet' }])
  const props = { useAccounts: (select: any) => select({ status: 'ready', accounts: [], usage: {}, error: null }),
    useAntigravity: (select: any) => select({ status: 'ready', accounts: [] }),
    useClaude: (select: any) => select({ status: 'ready', label: 'test account', plan: 'PRO', authMethod: 'claude.ai', errorCode: null, loginStarted: false }),
    loadAccounts: async () => {}, loadAntigravity: async () => {}, loadClaude: load, loginClaude: login, loadClaudeModels: models, t } as any
  render(<ProviderSettings {...props} />)
  fireEvent.click(screen.getByText(en.providerClaude))
  expect(await screen.findByRole('checkbox', { name: 'Claude Sonnet' })).toBeTruthy()
  expect(screen.queryByText(en.roadmapNotice)).toBeNull()
  fireEvent.click(screen.getAllByRole('button', { name: new RegExp(en.providerManage) })[2]!)
  expect(await screen.findByRole('button', { name: en.claudeCliLogin })).toBeTruthy()
})
it('shows CLI installation and non-subscription billing without fabricated subscription metadata', () => {
  const view = render(<ClaudeSettings state={{ status: 'missing', label: null, plan: null, authMethod: null, errorCode: null, loginStarted: false }} t={t} />)
  expect(screen.getByText(en.claudeCliMissing)).toBeTruthy()
  view.rerender(<ClaudeSettings state={{ status: 'ready', label: null, plan: null, authMethod: 'api_key', errorCode: null, loginStarted: false }} t={t} />)
  expect(screen.getByText(en.claudeCliApiBilling)).toBeTruthy()
  expect(screen.queryByText('PRO')).toBeNull()
})
it('controller projects closed data and discards late status after disposal', async () => {
  let resolve!: (value: any) => void
  const rpc = { call: vi.fn(() => new Promise(done => { resolve = done })) } as any
  const controller = new ClaudeController(rpc)
  const loading = controller.load()
  controller.dispose()
  resolve({ ok: true, value: { status: 'ready', label: 'synthetic', accessToken: 'SECRET' } })
  await loading
  expect(controller.store.getSnapshot().status).toBe('checking')
  expect(JSON.stringify(controller.store.getSnapshot())).not.toContain('SECRET')
  const live = new ClaudeController({ call: vi.fn(async () => ({ ok: true, value: { status: 'ready', label: 'sy***@example.com', plan: 'MAX', authMethod: 'claude.ai', accessToken: 'SECRET' } })) } as any)
  await live.load()
  expect(live.store.getSnapshot().status).toBe('ready')
  expect(JSON.stringify(live.store.getSnapshot())).not.toContain('SECRET')
  live.dispose()
})
