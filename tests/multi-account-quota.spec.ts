import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createMemoryAuthStore, createAuthStore } from '../src/antigravity/auth-store.ts'
import { AntigravityAuthService } from '../src/antigravity/auth-service.ts'
import { readProviderBalances } from '../src/usage/provider-balances.ts'
import { readCodexAccountUsage } from '../src/codex/account-usage.ts'

const request = () => new AbortController().signal
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
// Exercise the actual vendored vault/store, isolated from unrelated DSH adapter imports.
const region = (name: string) => source.split(`//#region src/${name}.js\n`)[1]!.split('//#endregion')[0]!
const { Vault, Store, rpc } = new Function('randomUUID', 'readCodexAccountUsage', 'CODEX_USAGE_URL', 'USER_AGENT', 'DEFAULT_TIMEOUT_MS$1', 'parseCodexUsage',
  `${region('account-vault')}\n${region('credential-store').split('/** Return only account state')[0]}\n${region('subscription-rpc')}\nreturn { Vault: DshOAuthAccountVault, Store: DshOAuthCredentialStore, rpc: createSubscriptionRpcHandler }`)(randomUUID, readCodexAccountUsage, 'https://chatgpt.com/backend-api/wham/usage', 'test', 15000, (value: unknown) => value)

function vaultFixture() {
  const credential = (accountId: string, expires: number) => ({ type: 'oauth', accountId, access: `${accountId}-old`, refresh: `${accountId}-refresh`, expires, email: `${accountId}@example.com` })
  let current: any = { kind: 'grant', payload: { version: 1, activeId: 'a', legacyAccountId: 'a', accounts: [
    { id: 'a', label: 'A', credential: credential('a', Date.now() + 3600000) }, { id: 'b', label: 'B', credential: credential('b', 0) },
  ] } }
  const credentials = { readRecord: async () => structuredClone(current), modifyRecord: vi.fn(async (_key, update) => { current = await update(structuredClone(current)) ?? current; return structuredClone(current) }), set: vi.fn(), unset: vi.fn() }
  const vault = new Vault(credentials, { key: 'test', legacyRef: 'legacy' })
  return { vault, credentials, snapshot: () => structuredClone(current), store: (id: string) => new Store(credentials, 'legacy', [], { vault, accountVaultId: id, expirySkewMs: 60000 }) }
}

describe('account-specific refresh and quota', () => {
  it.each(['memory', 'disk'])('Antigravity %s store rotates only the target token and never changes active account', async kind => {
    const directory = kind === 'disk' ? await mkdtemp(join(tmpdir(), 'dpe-quota-test-')) : undefined
    try {
      const store = directory ? createAuthStore(join(directory, 'auth.json')) : createMemoryAuthStore()
      await store.commit({ email: 'a@example.com', label: 'A', refreshToken: 'refresh-a', projectId: 'project-a' })
      await store.commit({ email: 'b@example.com', label: 'B', refreshToken: 'refresh-b', projectId: 'project-b' })
      const roster = await store.readAccounts()
      const a = roster.find(row => row.email === 'a@example.com')!, b = roster.find(row => row.email === 'b@example.com')!
      const rotated: string[] = []
      const refresh = async (token: string) => { rotated.push(token); return { accessToken: 'access-a', expiresAt: Date.now() + 3600000, refreshToken: `${token}-rotated` } }
      await Promise.all([store.refreshAccount(a.id, refresh), store.refreshAccount(a.id, refresh)])
      expect(rotated).toEqual(['refresh-a', 'refresh-a-rotated'])
      const after = await store.readAccounts()
      expect(after.find(row => row.id === a.id)).toMatchObject({ active: false, refreshToken: 'refresh-a-rotated-rotated', projectId: 'project-a', label: 'A' })
      expect(after.find(row => row.id === b.id)).toEqual(b)
      expect((await store.read())?.email).toBe('b@example.com')
      const unknownRefresh = vi.fn(refresh)
      expect(await store.refreshAccount('missing', unknownRefresh)).toBeUndefined()
      expect(unknownRefresh).not.toHaveBeenCalled()
      await expect(store.refreshAccount(a.id, async () => { throw new Error('test refresh failure') })).rejects.toThrow()
      expect((await store.readAccounts()).find(row => row.id === a.id)?.refreshToken).toBe('refresh-a-rotated-rotated')
    } finally { if (directory) await rm(directory, { recursive: true, force: true }) }
  })
  it('Antigravity service refreshes and queries both accounts with their own token/project, without selection', async () => {
    const store = createMemoryAuthStore()
    await store.commit({ email: 'a@example.com', label: 'A', refreshToken: 'refresh-a', projectId: 'project-a' })
    await store.commit({ email: 'b@example.com', label: 'B', refreshToken: 'refresh-b', projectId: 'project-b' })
    const select = vi.spyOn(store, 'selectAccount')
    const transport = { request: vi.fn(async (input: { accessToken: string; body: string }) => {
      const a = input.accessToken === 'access-refresh-a'
      expect(JSON.parse(input.body)).toEqual({ project: a ? 'project-a' : 'project-b' })
      return new Response(JSON.stringify({ groups: [{ group: 'gemini', modelCount: 2, windows: [{ window: 'weekly', remainingFraction: a ? 0.25 : 0.85, resetTime: new Date(Date.now() + 3600000).toISOString() }] }] }))
    }) }
    const refreshToken = vi.fn(async ({ refreshToken }: { refreshToken: string }) => ({ accessToken: `access-${refreshToken}`, expiresAt: Date.now() + 3600000 }))
    const service = new AntigravityAuthService({ store, credentialOptions: { refreshToken }, quotaOptions: { transport } })
    try {
      const rows = await readProviderBalances([{ id: 'google-antigravity', name: 'Antigravity' }], { antigravity: service }, request())
      expect(rows.sort((a, b) => a.label.localeCompare(b.label)).map(row => [row.label, row.status, row.active, row.windows[0]?.percent])).toEqual([['A', 'ready', false, 25], ['B', 'ready', true, 85]])
      expect(select).not.toHaveBeenCalled()
      expect(refreshToken).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(rows)).not.toMatch(/refresh-a|refresh-b|access-/)
    } finally { await service.dispose() }
  })
  it('Codex scoped stores serialize target updates, retain metadata and forbid sign-out', async () => {
    const { vault, store, snapshot, credentials } = vaultFixture()
    const before = snapshot()
    const refresh = vi.fn(async (current: any) => current.expires > Date.now() ? undefined : { ...current, access: 'b-fresh', refresh: 'b-rotated', expires: Date.now() + 3600000, email: undefined })
    const first = store('b'), second = store('b')
    await Promise.all([first.modify('openai-codex', refresh), second.modify('openai-codex', refresh)])
    const after = snapshot()
    expect(after.payload.activeId).toBe('a')
    expect(after.payload.legacyAccountId).toBe('a')
    expect(after.payload.accounts[0]).toEqual(before.payload.accounts[0])
    expect(after.payload.accounts[1]).toMatchObject({ label: 'B', credential: { access: 'b-fresh', refresh: 'b-rotated', email: 'b@example.com' } })
    expect(await first.read('openai-codex')).toMatchObject({ access: 'b-fresh', expires: after.payload.accounts[1].credential.expires - 60000 })
    expect(credentials.set).not.toHaveBeenCalled()
    await expect(first.delete('openai-codex')).rejects.toThrow('Scoped')
    expect(() => first.read('another')).toThrow()
    await expect(vault.modifyById('missing', refresh)).rejects.toThrow('Unknown')
    expect(() => new Store(credentials, 'legacy', [], { accountVaultId: 'b' })).toThrow()
  })
  it('Codex quota requests resolve native auth before reading the same persisted account', async () => {
    const { vault, store, snapshot } = vaultFixture()
    const before = snapshot()
    const scoped = store('b')
    const getAuth = vi.fn(async (id: string, signal: AbortSignal) => {
      expect(id).toBe('b'); signal.throwIfAborted()
      // Mirrors the native resolver’s locked refresh callback; the installed resolver is separately integration-checked.
      const updated = await scoped.modify('openai-codex', async (current: any) => ({ ...current, access: 'b-fresh', refresh: 'b-rotated', expires: Date.now() + 3600000 }))
      return { auth: { apiKey: updated.access } }
    })
    const fetchQuota = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ authorization: 'Bearer b-fresh', 'chatgpt-account-id': 'b' })
      expect(snapshot().payload.accounts[1].credential.refresh).toBe('b-rotated')
      return new Response('{"quota":71}')
    })
    const result = await readCodexAccountUsage('b', { getAuth, readCredential: id => vault.readById(id), resolveAccountId: credential => credential.accountId, fetch: fetchQuota, parse: value => value, url: 'https://chatgpt.com/backend-api/wham/usage', userAgent: 'test', timeoutMs: 15000 }, request())
    expect(result).toEqual({ quota: 71 })
    expect(snapshot().payload.accounts[0]).toEqual(before.payload.accounts[0])
    expect(snapshot().payload.activeId).toBe('a')
  })
  it.each([null, 1, '', 'x'.repeat(513)])('explicit invalid Codex target %s cannot fall back to active usage', async id => {
    const read = vi.fn(), getAccountAuth = vi.fn(), accountModels = vi.fn()
    const handler = rpc({ usageReader: { read }, getAccountAuth, accountModels })
    expect((await handler('usage', { id }, request())).ok).toBe(false)
    expect((await handler('models', { id }, request())).ok).toBe(false)
    expect(read).not.toHaveBeenCalled()
    expect(getAccountAuth).not.toHaveBeenCalled()
    expect(accountModels).not.toHaveBeenCalled()
    expect((await handler('models', {}, request())).ok).toBe(false)
  })
  it('Codex model catalogs load per explicit account and never fall back to the active one', async () => {
    const accountModels = vi.fn(async (id: string) => {
      if (id === 'missing') throw new Error('ChatGPT subscription is not signed in')
      return [{ id: `${id}-model`, name: `${id} Model` }]
    })
    const handler = rpc({ usageReader: { read: vi.fn() }, getAccountAuth: vi.fn(), accountModels })
    expect(await handler('models', { id: 'b' }, request())).toEqual({ ok: true, value: [{ id: 'b-model', name: 'b Model' }] })
    expect(accountModels).toHaveBeenCalledExactlyOnceWith('b', expect.anything())
    expect(await handler('models', { id: 'missing' }, request())).toMatchObject({ ok: false })
    expect(accountModels).toHaveBeenCalledTimes(2)
  })
  it('merges the plan subscription deadline into targeted usage and keeps quota when that read fails', async () => {
    const { vault } = vaultFixture()
    const fetchStub = vi.fn(async (input: string) => input.includes('/subscriptions')
      ? new Response(JSON.stringify({ plan_type: 'plus', active_until: '2027-01-15T16:00:00Z' }))
      : new Response(JSON.stringify({ quota: 71 })))
    vi.stubGlobal('fetch', fetchStub)
    try {
      const handler = rpc({ usageReader: { read: vi.fn() }, accountVault: vault, getAccountAuth: async () => ({ auth: { apiKey: 'b-old' } }) })
      expect(await handler('usage', { id: 'b' }, request())).toEqual({ ok: true, value: { quota: 71, subscriptionUntil: '2027-01-15T16:00:00Z' } })
      expect(fetchStub.mock.calls.map(call => String(call[0]))).toEqual([
        'https://chatgpt.com/backend-api/wham/usage',
        'https://chatgpt.com/backend-api/subscriptions?account_id=b',
      ])
      fetchStub.mockImplementation(async (input: string) => input.includes('/subscriptions')
        ? new Response('{}', { status: 500 })
        : new Response(JSON.stringify({ quota: 72 })))
      expect(await handler('usage', { id: 'b' }, request())).toEqual({ ok: true, value: { quota: 72, subscriptionUntil: null } })
    } finally { vi.unstubAllGlobals() }
  })
  it.each(['refresh', 'persist', 'cancel'])('Codex %s failure prevents quota fetch and active-account fallback', async failure => {
    const controller = new AbortController(), fetchQuota = vi.fn()
    const options = { getAuth: async () => { if (failure === 'cancel') controller.abort(); else throw new Error('test failure'); return { auth: { apiKey: 'opaque' } } }, readCredential: vi.fn(), resolveAccountId: () => 'b', fetch: fetchQuota, parse: (value: unknown) => value, url: 'https://chatgpt.com/backend-api/wham/usage', userAgent: 'test', timeoutMs: 15000 }
    await expect(readCodexAccountUsage('b', options, controller.signal)).rejects.toThrow()
    expect(fetchQuota).not.toHaveBeenCalled()
    expect(options.readCredential).not.toHaveBeenCalled()
  })
})
