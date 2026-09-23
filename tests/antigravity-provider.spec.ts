import { describe, expect, it, vi } from 'vitest'
import {
  AntigravityController, decodeModels, decodeStatus, isAntigravityProvider,
} from '../src/client/providers/antigravity.ts'
import { createMemoryAuthStore } from '../src/antigravity/auth-store.ts'

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

  it('supports multi-account switching and removal in controller', async () => {
    const initialAccounts = [
      { id: 'work@gmail.com', label: 'Work', email: 'work@gmail.com', active: true },
      { id: 'personal@gmail.com', label: 'Personal', email: 'personal@gmail.com', active: false },
    ]
    const call = vi.fn()
      .mockImplementationOnce(() => ok({ ...signedIn, accounts: initialAccounts }))
      .mockImplementationOnce(() => ok(catalog))
      .mockImplementationOnce(() => ok({ accounts: [
        { id: 'work@gmail.com', label: 'Work', email: 'work@gmail.com', active: false },
        { id: 'personal@gmail.com', label: 'Personal', email: 'personal@gmail.com', active: true },
      ]}))
      .mockImplementationOnce(() => ok({ ...signedIn, accounts: [
        { id: 'work@gmail.com', label: 'Work', email: 'work@gmail.com', active: false },
        { id: 'personal@gmail.com', label: 'Personal', email: 'personal@gmail.com', active: true },
      ]}))
      .mockImplementationOnce(() => ok(catalog))

    const controller = new AntigravityController({ call } as never)
    await controller.load()
    expect(controller.store.getSnapshot().accounts).toHaveLength(2)
    expect(controller.store.getSnapshot().accounts[0]?.active).toBe(true)

    await controller.selectAccount('personal@gmail.com')
    expect(controller.store.getSnapshot().accounts[1]?.active).toBe(true)
  })

  it('reads quota summary and decodes gemini and claude groups', async () => {
    const quotaData = {
      state: 'available',
      checkedAt: '2026-09-22T00:00:00.000Z',
      groups: [
        {
          group: 'gemini',
          modelCount: 5,
          windows: [
            { window: '5h', remainingFraction: 0.95, resetTime: '2026-09-22T05:00:00.000Z' },
            { window: 'weekly', remainingFraction: 0.8, resetTime: '2026-09-29T00:00:00.000Z' },
          ],
        },
        {
          group: 'non-gemini',
          modelCount: 2,
          windows: [
            { window: '5h', remainingFraction: 1.0, resetTime: '2026-09-22T05:00:00.000Z' },
            { window: 'weekly', remainingFraction: 0.75, resetTime: '2026-09-29T00:00:00.000Z' },
          ],
        },
      ],
    }

    const call = vi.fn()
      .mockImplementationOnce(() => ok(signedIn))
      .mockImplementationOnce(() => ok(catalog))
      .mockImplementationOnce(() => ok(quotaData))

    const controller = new AntigravityController({ call } as never)
    await controller.load()
    await controller.readQuota()

    const usageMap = controller.store.getSnapshot().usage
    const usage = usageMap['fo***@gmail.com'] ?? usageMap['default']
    expect(usage?.state).toBe('available')
    expect(usage?.groups).toHaveLength(2)
    expect(usage?.groups?.[0]?.group).toBe('gemini')
    expect(usage?.groups?.[0]?.windows[0]?.remainingFraction).toBe(0.95)
    expect(usage?.groups?.[1]?.group).toBe('non-gemini')
  })

  it('supports in-memory multi-account operations in auth store', async () => {
    const store = createMemoryAuthStore()
    expect(await store.read()).toBeUndefined()
    expect(await store.readAccounts()).toEqual([])

    await store.commit({ refreshToken: 'token1', projectId: 'p1', email: 'one@gmail.com' })
    const acc1 = await store.read()
    expect(acc1?.email).toBe('one@gmail.com')
    expect(await store.readAccounts()).toHaveLength(1)

    await store.commit({ refreshToken: 'token2', projectId: 'p2', email: 'two@gmail.com' })
    const acc2 = await store.read()
    expect(acc2?.email).toBe('two@gmail.com')
    const accounts = await store.readAccounts()
    expect(accounts).toHaveLength(2)

    await store.selectAccount('one@gmail.com')
    expect((await store.read())?.email).toBe('one@gmail.com')

    const remaining = await store.removeAccount('one@gmail.com')
    expect(remaining).toHaveLength(1)
    expect((await store.read())?.email).toBe('two@gmail.com')
  })
})
