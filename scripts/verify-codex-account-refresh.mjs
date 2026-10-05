/** Exercise the installed native OAuth resolver using synthetic credentials only.
 * Usage: node scripts/verify-codex-account-refresh.mjs <DSH implementation checkout>
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
if (!process.argv[2]) throw new Error('Pass the DSH implementation checkout path')
const { createModels } = await import(pathToFileURL(resolve(process.argv[2], 'node_modules/@earendil-works/pi-ai/dist/index.js')).href)
const source = await readFile(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = name => source.split(`//#region src/${name}.js\n`)[1].split('//#endregion')[0]
const { Vault, Store } = new Function('randomUUID', `${region('account-vault')}\n${region('credential-store').split('/** Return only account state')[0]}\nreturn { Vault: DshOAuthAccountVault, Store: DshOAuthCredentialStore }`)(randomUUID)
let record = { kind: 'grant', payload: { version: 1, activeId: 'active', accounts: [
  { id: 'active', label: 'Active', credential: { type: 'oauth', access: 'active-access', refresh: 'active-refresh', expires: Date.now() + 3600000, accountId: 'active' } },
  { id: 'other', label: 'Other', credential: { type: 'oauth', access: 'expired-access', refresh: 'other-refresh', expires: 0, accountId: 'other', email: 'other@example.com' } },
] } }
const initialActive = structuredClone(record.payload.accounts[0])
const credentials = { readRecord: async () => structuredClone(record), modifyRecord: async (_key, update) => { record = await update(structuredClone(record)) ?? record; return structuredClone(record) }, set: async () => { throw new Error('Unexpected legacy write') } }
const vault = new Vault(credentials, { key: 'synthetic', legacyRef: 'synthetic' })
let refreshes = 0
const provider = { id: 'openai-codex', auth: { oauth: {
  refresh: async (current, signal) => { signal.throwIfAborted(); refreshes++; assert.equal(current.refresh, 'other-refresh'); return { ...current, access: 'fresh-other-access', refresh: 'rotated-other-refresh', expires: Date.now() + 3600000, email: undefined } },
  toAuth: async credential => ({ apiKey: credential.access }),
} }, getModels: () => [] }
const modelsFor = id => {
  const models = createModels({ credentials: new Store(credentials, 'synthetic', [], { vault, accountVaultId: id, expirySkewMs: 60000 }) })
  models.setProvider(provider)
  return models
}
const [first, second] = await Promise.all([modelsFor('other').getAuth('openai-codex'), modelsFor('other').getAuth('openai-codex')])
assert.equal(first.auth.apiKey, 'fresh-other-access')
assert.equal(second.auth.apiKey, 'fresh-other-access')
assert.equal(refreshes, 1)
assert.equal(record.payload.activeId, 'active')
assert.deepEqual(record.payload.accounts[0], initialActive)
assert.equal(record.payload.accounts[1].credential.refresh, 'rotated-other-refresh')
assert.equal(record.payload.accounts[1].credential.email, 'other@example.com')
assert.equal((await modelsFor('active').getAuth('openai-codex')).auth.apiKey, 'active-access')
assert.equal(refreshes, 1)
await assert.rejects(modelsFor('missing').getAuth('openai-codex'))
console.log('Installed native OAuth resolver passed: inactive account refreshed once, rotation persisted, active account unchanged; no real credentials or network used.')
