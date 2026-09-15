import { describe, expect, it, vi } from 'vitest'
import { CodexAccountsController, isCodexProvider, maskedEmail } from '../src/client/codexAccounts.ts'

const accounts = [
  { id: 'work', label: 'Work', email: 'work@example.com', active: true },
  { id: 'personal', label: 'Personal', email: 'personal@example.com', active: false },
]

function ok(value: unknown) { return Promise.resolve({ ok: true as const, value }) }

describe('Codex subscription account integration', () => {
  it('recognizes only Codex subscription routes and masks emails', () => {
    expect(isCodexProvider('openai-codex')).toBe(true)
    expect(isCodexProvider('openai-codex-account')).toBe(true)
    expect(isCodexProvider('deepseek')).toBe(false)
    expect(maskedEmail('work@example.com')).toBe('wo***@example.com')
  })

  it('loads the secret-free roster and performs the real account/select RPC', async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => ok({ authenticated: true, accounts }))
      .mockImplementationOnce(() => ok({ authenticated: true, accounts: [
        { ...accounts[0]!, active: false }, { ...accounts[1]!, active: true },
      ] }))
    const controller = new CodexAccountsController({ call } as never)
    await controller.load()
    expect(controller.store.getSnapshot().accounts.map(account => account.label)).toEqual(['Work', 'Personal'])
    await controller.select('personal')
    expect(call).toHaveBeenLastCalledWith('/api', 'codex-subscription/account/select', { id: 'personal' })
    expect(controller.store.getSnapshot().accounts.find(account => account.active)?.id).toBe('personal')
  })

  it('retains the previous roster when switching fails', async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => ok({ authenticated: true, accounts }))
      .mockImplementationOnce(() => Promise.resolve({ ok: false, error: { message: 'offline' } }))
    const controller = new CodexAccountsController({ call } as never)
    await controller.load()
    await expect(controller.select('personal')).rejects.toThrow('offline')
    expect(controller.store.getSnapshot().accounts.find(account => account.active)?.id).toBe('work')
    expect(controller.store.getSnapshot().error).toBe('offline')
  })
})
