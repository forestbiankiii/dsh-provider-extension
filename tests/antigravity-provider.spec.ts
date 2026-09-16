import { describe, expect, it, vi } from 'vitest'
import {
  AntigravityController, decodeModels, decodeStatus, isAntigravityProvider,
} from '../src/client/providers/antigravity.ts'

const status = {
  status: {
    pluginId: 'dsh-antigravity-auth',
    phase: 'bootstrap',
    privateSelfUse: true,
    singleAccount: true,
    riskAcknowledgementRequired: true,
    riskAcknowledged: false,
    login: { phase: 'idle', configured: false, projectAvailable: false },
    capabilities: [],
  },
}

const signedIn = {
  status: {
    ...status.status,
    riskAcknowledged: true,
    login: { phase: 'success', configured: true, projectAvailable: true, maskedEmail: 'fo***@gmail.com' },
  },
}

const catalog = { state: 'live-available', models: [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', state: 'live-available' }] }

function ok(value: unknown) { return Promise.resolve({ ok: true as const, value }) }
function endpoints(call: { mock: { calls: unknown[][] } }): string[] {
  return call.mock.calls.map(args => String(args[1]))
}

describe('antigravity provider integration', () => {
  it('recognizes only Antigravity routes', () => {
    expect(isAntigravityProvider('google-antigravity')).toBe(true)
    expect(isAntigravityProvider('google-antigravity-work')).toBe(true)
    expect(isAntigravityProvider('openai-codex')).toBe(false)
    expect(isAntigravityProvider(undefined)).toBe(false)
  })

  it('decodes the status envelope and rejects a foreign plugin id', () => {
    expect(decodeStatus(status)?.login.phase).toBe('idle')
    expect(decodeStatus({ status: { ...status.status, pluginId: 'other-plugin' } })).toBeUndefined()
    expect(decodeStatus(null)).toBeUndefined()
    expect(decodeStatus({ status: { ...status.status, login: { phase: 'nonsense' } } })).toBeUndefined()
  })

  it('decodes the advisory model catalog and drops unknown states', () => {
    expect(decodeModels(catalog)?.models[0]?.id).toBe('gemini-3.8-flash')
    expect(decodeModels({ state: 'not-a-state', models: [] })).toBeUndefined()
    expect(decodeModels({ state: 'snapshot', models: [{ id: 'a', name: 'A', state: 'weird' }] })?.models).toEqual([])
  })

  it('treats an unknown channel as a missing companion bundle', async () => {
    const call = vi.fn(async () => ({ ok: false, error: { message: 'unknown endpoint antigravity-auth/status' } }))
    const controller = new AntigravityController({ call } as never)
    await controller.load()
    expect(controller.store.getSnapshot().status).toBe('absent')
  })

  it('acknowledges the risk notice before starting the Google login', async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => ok(status))
      .mockImplementationOnce(() => ok({ acknowledged: true }))
      .mockImplementationOnce(() => ok({ started: true, phase: 'pending', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', expiresAt: '2026-01-01T00:00:00.000Z' }))
      .mockImplementationOnce(() => ok(signedIn))
      .mockImplementationOnce(() => ok(catalog))
    const controller = new AntigravityController({ call } as never)
    await controller.load()
    await controller.login()
    expect(endpoints(call)).toEqual([
      'antigravity-auth/status',
      'antigravity-auth/acknowledge-risk',
      'antigravity-auth/login',
      'antigravity-auth/status',
      'antigravity-auth/models',
    ])
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.view?.login.maskedEmail).toBe('fo***@gmail.com')
    expect(state.models?.models).toHaveLength(1)
  })

  it('keeps the current view when a login call fails', async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => ok(status))
      .mockImplementationOnce(() => ok({ acknowledged: true }))
      .mockImplementationOnce(() => Promise.resolve({ ok: false, error: { message: 'port busy' } }))
    const controller = new AntigravityController({ call } as never)
    await controller.load()
    await expect(controller.login()).rejects.toThrow('port busy')
    const state = controller.store.getSnapshot()
    expect(state.busy).toBe(false)
    expect(state.error).toBe('port busy')
    expect(state.status).toBe('ready')
  })
})
