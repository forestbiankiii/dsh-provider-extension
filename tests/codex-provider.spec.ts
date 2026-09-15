import { describe, expect, it, vi } from 'vitest'
import { CodexAccountsController, decodeQuota, isCodexProvider, maskedEmail } from '../src/client/providers/codex.ts'

const accounts = [
  { id: 'work', label: 'Work', email: 'work@example.com', active: true },
  { id: 'personal', label: 'Personal', email: 'personal@example.com', active: false },
]

const usage = {
  rateLimits: [
    { id: 'codex', name: 'Codex', windows: [
      { windowSeconds: 18_000, remainingPercent: 43.4, resetsAt: 1_700_000_000 },
      { windowSeconds: 604_800, remainingPercent: 76.2, resetsAt: 1_700_500_000 },
    ] },
    { id: 'codex-spark', name: 'Spark', windows: [{ windowSeconds: 604_800, remainingPercent: 5 }] },
  ],
}

function ok(value: unknown) { return Promise.resolve({ ok: true as const, value }) }

describe('Codex subscription account integration', () => {
  it('recognizes only Codex subscription routes and masks emails', () => {
    expect(isCodexProvider('openai-codex')).toBe(true)
    expect(isCodexProvider('openai-codex-account')).toBe(true)
    expect(isCodexProvider('deepseek')).toBe(false)
    expect(maskedEmail('work@example.com')).toBe('wo***@example.com')
  })

  it('reads the weekly window from the codex limit only', () => {
    expect(decodeQuota(usage)).toEqual({ weeklyPercent: 76, weeklyResetsAt: 1_700_500_000, shortPercent: 43 })
    expect(decodeQuota({ rateLimits: [] })).toEqual({})
    expect(decodeQuota({ rateLimits: [{ id: 'codex', windows: [{ windowSeconds: 604_800, remainingPercent: 150 }] }] })).toEqual({})
    expect(decodeQuota(null)).toEqual({})
  })

  it('loads the secret-free roster and performs the real account/select RPC', async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => ok({ authenticated: true, accounts }))
      .mockImplementationOnce(() => ok(usage))
      .mockImplementationOnce(() => ok({ authenticated: true, accounts: [
        { ...accounts[0]!, active: false }, { ...accounts[1]!, active: true },
      ] }))
    const controller = new CodexAccountsController({ call } as never)
    await controller.load()
    expect(controller.store.getSnapshot().accounts.map(account => account.label)).toEqual(['Work', 'Personal'])
    await waitForUsage(controller)
    expect(controller.store.getSnapshot().usage.work).toEqual({ status: 'ready', value: { weeklyPercent: 76, weeklyResetsAt: 1_700_500_000, shortPercent: 43 } })
    await controller.select('personal')
    expect(call).toHaveBeenCalledWith('/api', 'codex-subscription/account/select', { id: 'personal' })
    expect(controller.store.getSnapshot().accounts.find(account => account.active)?.id).toBe('personal')
  })

  it('reads a non-active account by temporarily switching and restoring it', async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => ok({ authenticated: true, accounts }))
      .mockImplementationOnce(() => ok(usage))
      .mockImplementationOnce(() => ok({ authenticated: true, accounts: [
        { ...accounts[0]!, active: false }, { ...accounts[1]!, active: true },
      ] }))
      .mockImplementationOnce(() => ok({ ...usage, rateLimits: [{ id: 'codex', windows: [{ windowSeconds: 604_800, remainingPercent: 12 }] }] }))
      .mockImplementationOnce(() => ok({ authenticated: true, accounts }))
    const controller = new CodexAccountsController({ call } as never)
    await controller.load()
    await controller.readQuota('personal')
    const calls = call.mock.calls.map(args => args[1] as string)
    expect(calls).toEqual([
      'codex-subscription/status',
      'codex-subscription/usage',
      'codex-subscription/account/select',
      'codex-subscription/usage',
      'codex-subscription/account/select',
    ])
    const state = controller.store.getSnapshot()
    expect(state.accounts.find(account => account.active)?.id).toBe('work')
    expect(state.usage.personal).toEqual({ status: 'ready', value: { weeklyPercent: 12 } })
    expect(state.restoreFailed).toBe(false)
  })

  it('reports a failed restore instead of leaving the switch silent', async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => ok({ authenticated: true, accounts }))
      .mockImplementationOnce(() => ok(usage))
      .mockImplementationOnce(() => ok({ authenticated: true, accounts: [
        { ...accounts[0]!, active: false }, { ...accounts[1]!, active: true },
      ] }))
      .mockImplementationOnce(() => ok(usage))
      .mockImplementationOnce(() => Promise.resolve({ ok: false, error: { message: 'offline' } }))
    const controller = new CodexAccountsController({ call } as never)
    await controller.load()
    await controller.readQuota('personal')
    expect(controller.store.getSnapshot().restoreFailed).toBe(true)
  })

  it('retains the previous roster when switching fails', async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => ok({ authenticated: true, accounts }))
      .mockImplementationOnce(() => ok(usage))
      .mockImplementationOnce(() => Promise.resolve({ ok: false, error: { message: 'offline' } }))
    const controller = new CodexAccountsController({ call } as never)
    await controller.load()
    await expect(controller.select('personal')).rejects.toThrow('offline')
    expect(controller.store.getSnapshot().accounts.find(account => account.active)?.id).toBe('work')
    expect(controller.store.getSnapshot().error).toBe('offline')
  })
})

async function waitForUsage(controller: CodexAccountsController): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (controller.store.getSnapshot().usage.work?.status === 'ready') return
    await Promise.resolve()
  }
}
