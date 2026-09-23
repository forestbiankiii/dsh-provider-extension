/** Owner-only, versioned, multi-account refresh-token persistence with v1 migration. */

import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, lstat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isBoundedSafeText } from './safe-text.ts'

export const AUTH_RECORD_VERSION = 1 as const
export const MULTI_AUTH_RECORD_VERSION = 2 as const

const AUTH_STORE_LOCK_NAME = '.auth.lock'
const AUTH_STORE_LOCK_TIMEOUT_MS = 10_000
const AUTH_STORE_LOCK_STALE_MS = 30_000
const AUTH_STORE_LOCK_RETRY_MS = 10

export interface AuthRecordDraft {
  readonly refreshToken: string
  readonly projectId: string
  readonly email?: string
  readonly label?: string
  readonly tier?: string
  /** Keep the same lineage for a refresh; a new login omits it to fence older work. */
  readonly lineage?: string
}

export interface AntigravityAuthRecord {
  readonly version: typeof AUTH_RECORD_VERSION
  readonly refreshToken: string
  readonly projectId: string
  readonly email?: string
  readonly revision: number
  readonly updatedAt: string
  /** A per-login lineage fence; absent only on records written by older versions. */
  readonly lineage?: string
}

export interface AntigravityAccountRecord {
  readonly id: string
  readonly label: string
  readonly email?: string | undefined
  readonly tier?: string | undefined
  readonly refreshToken: string
  readonly projectId: string
  readonly lineage?: string | undefined
  readonly active: boolean
  readonly updatedAt: string
}

export interface AntigravityMultiAuthRecord {
  readonly version: typeof MULTI_AUTH_RECORD_VERSION
  readonly activeId: string
  readonly accounts: readonly AntigravityAccountRecord[]
  readonly revision: number
  readonly updatedAt: string
}

export interface AuthStoreOptions {
  readonly now?: () => number
  /** Override process.platform only for deterministic cross-platform tests. */
  readonly platform?: NodeJS.Platform
}

export interface AntigravityAuthStore {
  /** Return the currently active account as an AntigravityAuthRecord. */
  read(): Promise<AntigravityAuthRecord | undefined>
  /** Return all saved accounts. */
  readAccounts(): Promise<readonly AntigravityAccountRecord[]>
  /** Select an active account by id. Returns updated active record. */
  selectAccount(id: string): Promise<AntigravityAuthRecord | undefined>
  /** Update an account by id (label, tier). Returns updated accounts. */
  updateAccount(id: string, patch: { label?: string | undefined; tier?: string | undefined }): Promise<readonly AntigravityAccountRecord[]>
  /** Rename an account by id. Returns updated accounts. */
  renameAccount(id: string, label: string): Promise<readonly AntigravityAccountRecord[]>
  /** Remove an account by id. Returns remaining accounts. */
  removeAccount(id: string): Promise<readonly AntigravityAccountRecord[]>
  /** Add or update an account draft. Sets it active and returns its record. */
  commit(draft: AuthRecordDraft): Promise<AntigravityAuthRecord>
  compareAndCommit(
    expectedRevision: number,
    draft: AuthRecordDraft,
    expectedLineage?: string,
  ): Promise<AntigravityAuthRecord | undefined>
  /** Clear only when the observed record is still the same account lineage. */
  clearIfCurrent(expectedRevision: number, expectedLineage?: string): Promise<boolean>
  clear(): Promise<void>
}

export type AuthStoreErrorCode =
  | 'AUTH_STORE_CORRUPT'
  | 'AUTH_STORE_UNSUPPORTED_VERSION'
  | 'AUTH_STORE_UNSAFE_PERMISSIONS'
  | 'AUTH_STORE_CONFLICT'
  | 'AUTH_STORE_IO'

export class AuthStoreError extends Error {
  readonly code: AuthStoreErrorCode

  constructor(code: AuthStoreErrorCode, message: string) {
    super(message)
    this.name = 'AuthStoreError'
    this.code = code
  }
}

/** Resolve the plugin-owned default path without reading it. */
export function defaultAuthStorePath(
  env: NodeJS.ProcessEnv = process.env,
  home = env.HOME,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    const windowsDataHome = env.LOCALAPPDATA ?? env.APPDATA
    const base = typeof windowsDataHome === 'string' && windowsDataHome.length > 0
      ? windowsDataHome
      : env.USERPROFILE ?? home ?? ''
    return join(base, 'dsh-antigravity-auth', 'auth.json')
  }
  const dataHome = env.XDG_DATA_HOME
  const base = typeof dataHome === 'string' && dataHome.length > 0
    ? dataHome
    : join(home ?? '', '.local', 'share')
  return join(base, 'dsh-antigravity-auth', 'auth.json')
}

/** Create one store supporting both multi-account storage and legacy single-account read contract. */
export function createAuthStore(path: string, options: AuthStoreOptions = {}): AntigravityAuthStore {
  const now = options.now ?? (() => Date.now())
  const platform = options.platform ?? process.platform
  const enqueue = createMutationQueue()
  const readMulti = () => readMultiRecordForPlatform(path, platform)

  return {
    read: async () => {
      const multi = await readMulti()
      return activeFromMulti(multi)
    },
    readAccounts: async () => {
      const multi = await readMulti()
      return multi?.accounts ?? []
    },
    selectAccount: id => enqueue(() => withStoreLock(path, async () => {
      const multi = await readMulti()
      const updated = selectAccountRecord(multi, id)
      if (updated === undefined) return undefined
      await writeMultiAuthRecord(path, updated)
      return activeFromMulti(updated)
    })),
    updateAccount: (id, patch) => enqueue(() => withStoreLock(path, async () => {
      const multi = await readMulti()
      if (!multi) return []
      const accounts = multi.accounts.map(acc => {
        if (acc.id !== id) return acc
        return {
          ...acc,
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.tier !== undefined ? { tier: patch.tier } : {}),
        }
      })
      const updated: AntigravityMultiAuthRecord = { ...multi, accounts, updatedAt: new Date().toISOString() }
      await writeMultiAuthRecord(path, updated)
      return updated.accounts
    })),
    renameAccount: (id, label) => enqueue(() => withStoreLock(path, async () => {
      const multi = await readMulti()
      if (!multi) return []
      const accounts = multi.accounts.map(acc => acc.id === id ? { ...acc, label } : acc)
      const updated: AntigravityMultiAuthRecord = { ...multi, accounts, updatedAt: new Date().toISOString() }
      await writeMultiAuthRecord(path, updated)
      return updated.accounts
    })),
    removeAccount: id => enqueue(() => withStoreLock(path, async () => {
      const multi = await readMulti()
      const updated = removeAccountRecord(multi, id)
      if (updated === undefined) {
        try { await unlink(path) } catch (err) { if (!isNotFound(err)) throw storeIoError() }
        await syncDirectory(dirname(path))
        return []
      }
      await writeMultiAuthRecord(path, updated)
      return updated.accounts
    })),
    commit: draft => enqueue(() => withStoreLock(path, async () => {
      const current = await readMulti()
      const updated = commitAccount(current, draft, now())
      await writeMultiAuthRecord(path, updated)
      return activeFromMulti(updated)!
    })),
    compareAndCommit: (expectedRevision, draft, expectedLineage) => enqueue(() => withStoreLock(path, async () => {
      const current = await readMulti()
      const active = activeFromMulti(current)
      if ((active?.revision ?? 0) !== expectedRevision) return undefined
      const lineage = expectedLineage ?? draft.lineage
      if (lineage === undefined ? active?.lineage !== undefined : active?.lineage !== lineage) return undefined
      const updated = commitAccount(current, draft, now(), expectedRevision + 1)
      await writeMultiAuthRecord(path, updated)
      return activeFromMulti(updated)
    })),
    clearIfCurrent: (expectedRevision, expectedLineage) => enqueue(() => withStoreLock(path, async () => {
      const current = await readMulti()
      const active = activeFromMulti(current)
      if ((active?.revision ?? 0) !== expectedRevision) return false
      if (expectedLineage === undefined ? active?.lineage !== undefined : active?.lineage !== expectedLineage) return false
      try {
        await unlink(path)
      } catch (error) {
        if (!isNotFound(error)) throw storeIoError()
      }
      await syncDirectory(dirname(path))
      return true
    })),
    clear: () => enqueue(() => withStoreLock(path, async () => {
      try {
        await unlink(path)
      } catch (error) {
        if (!isNotFound(error)) throw storeIoError()
      }
      await syncDirectory(dirname(path))
    })),
  }
}

/** An offline store useful for tests and process-local bootstrap fixtures. */
export function createMemoryAuthStore(initial?: AntigravityAuthRecord, options: AuthStoreOptions = {}): AntigravityAuthStore {
  const now = options.now ?? (() => Date.now())
  let current: AntigravityMultiAuthRecord | undefined = initial === undefined
    ? undefined
    : {
      version: MULTI_AUTH_RECORD_VERSION,
      activeId: initial.email || 'default',
      accounts: [{
        id: initial.email || 'default',
        label: initial.email || 'Google Account',
        email: initial.email,
        refreshToken: initial.refreshToken,
        projectId: initial.projectId,
        lineage: initial.lineage,
        active: true,
        updatedAt: initial.updatedAt,
      }],
      revision: initial.revision,
      updatedAt: initial.updatedAt,
    }

  const enqueue = createMutationQueue()
  return {
    read: async () => activeFromMulti(current),
    readAccounts: async () => current?.accounts ?? [],
    selectAccount: async id => enqueue(async () => {
      const updated = selectAccountRecord(current, id)
      if (updated === undefined) return undefined
      current = updated
      return activeFromMulti(current)
    }),
    updateAccount: async (id, patch) => enqueue(async () => {
      if (!current) return []
      const accounts = current.accounts.map(acc => {
        if (acc.id !== id) return acc
        return {
          ...acc,
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.tier !== undefined ? { tier: patch.tier } : {}),
        }
      })
      current = { ...current, accounts, updatedAt: new Date().toISOString() }
      return current.accounts
    }),
    renameAccount: async (id, label) => enqueue(async () => {
      if (!current) return []
      const accounts = current.accounts.map(acc => acc.id === id ? { ...acc, label } : acc)
      current = { ...current, accounts, updatedAt: new Date().toISOString() }
      return current.accounts
    }),
    removeAccount: async id => enqueue(async () => {
      const updated = removeAccountRecord(current, id)
      current = updated
      return current?.accounts ?? []
    }),
    commit: draft => enqueue(async () => {
      current = commitAccount(current, draft, now())
      return activeFromMulti(current)!
    }),
    compareAndCommit: (expectedRevision, draft, expectedLineage) => enqueue(async () => {
      const active = activeFromMulti(current)
      if ((active?.revision ?? 0) !== expectedRevision) return undefined
      const lineage = expectedLineage ?? draft.lineage
      if (lineage === undefined ? active?.lineage !== undefined : active?.lineage !== lineage) return undefined
      current = commitAccount(current, draft, now(), expectedRevision + 1)
      return activeFromMulti(current)
    }),
    clearIfCurrent: async (expectedRevision, expectedLineage) => enqueue(async () => {
      const active = activeFromMulti(current)
      if ((active?.revision ?? 0) !== expectedRevision) return false
      if (expectedLineage === undefined ? active?.lineage !== undefined : active?.lineage !== expectedLineage) return false
      current = undefined
      return true
    }),
    clear: () => enqueue(async () => { current = undefined }),
  }
}

function createMutationQueue() {
  let mutation: Promise<void> = Promise.resolve()
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = mutation.then(operation, operation)
    mutation = next.then(() => {}, () => {})
    return next
  }
}

async function withStoreLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const parent = dirname(path)
  await prepareParent(parent)
  const lockPath = join(parent, AUTH_STORE_LOCK_NAME)
  const deadline = Date.now() + AUTH_STORE_LOCK_TIMEOUT_MS

  while (true) {
    try {
      const handle = await open(lockPath, 'wx', 0o600)
      try {
        await handle.writeFile(`${process.pid}\n`, 'utf8')
        await handle.sync()
        return await operation()
      } finally {
        await handle.close().catch(() => {})
        await unlink(lockPath).catch(() => {})
      }
    } catch (error) {
      if (error instanceof AuthStoreError) throw error
      if (!isAlreadyExists(error)) throw storeIoError()
      await removeStaleLock(lockPath)
      if (Date.now() >= deadline) throw conflictError()
      await new Promise<void>(resolve => setTimeout(resolve, AUTH_STORE_LOCK_RETRY_MS))
    }
  }
}

async function removeStaleLock(lockPath: string): Promise<void> {
  try {
    const stat = await lstat(lockPath)
    if (Date.now() - stat.mtimeMs > AUTH_STORE_LOCK_STALE_MS) {
      await unlink(lockPath).catch(() => {})
    }
  } catch {}
}

async function prepareParent(parent: string): Promise<void> {
  await mkdir(parent, { recursive: true, mode: 0o700 })
  await chmod(parent, 0o700).catch(() => {})
}

async function syncDirectory(directory: string): Promise<void> {
  try {
    const handle = await open(directory, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {}
}

async function readMultiRecordForPlatform(
  path: string,
  platform: NodeJS.Platform,
): Promise<AntigravityMultiAuthRecord | undefined> {
  let fileInfo
  try {
    fileInfo = await lstat(path)
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw storeIoError()
  }
  if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) throw unsafePermissionsError()
  await assertOwnerOnly(path, platform)

  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw storeIoError()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw corruptError()
  }
  return parseMultiOrV1Record(parsed)
}

export async function writeAuthRecord(path: string, record: AntigravityAuthRecord): Promise<void> {
  const multi: AntigravityMultiAuthRecord = {
    version: MULTI_AUTH_RECORD_VERSION,
    activeId: record.email || 'default',
    accounts: [{
      id: record.email || 'default',
      label: record.email || 'Google Account',
      email: record.email,
      refreshToken: record.refreshToken,
      projectId: record.projectId,
      lineage: record.lineage,
      active: true,
      updatedAt: record.updatedAt,
    }],
    revision: record.revision,
    updatedAt: record.updatedAt,
  }
  await writeMultiAuthRecord(path, multi)
}

export async function writeMultiAuthRecord(path: string, record: AntigravityMultiAuthRecord): Promise<void> {
  const parent = dirname(path)
  try {
    await prepareParent(parent)
    const temporary = join(parent, `.${randomUUID()}.tmp`)
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, 'utf8')
        await handle.sync()
      } finally {
        await handle.close().catch(() => {})
      }
      await chmod(temporary, 0o600)
      await rename(temporary, path)
      await chmod(path, 0o600)
      await syncDirectory(parent)
    } catch {
      await unlink(temporary).catch(() => {})
      throw storeIoError()
    }
  } catch (error) {
    if (error instanceof AuthStoreError) throw error
    throw storeIoError()
  }
}

function activeFromMulti(multi?: AntigravityMultiAuthRecord): AntigravityAuthRecord | undefined {
  if (!multi || multi.accounts.length === 0) return undefined
  const active = multi.accounts.find(a => a.id === multi.activeId) ?? multi.accounts[0]
  if (!active) return undefined
  return {
    version: AUTH_RECORD_VERSION,
    refreshToken: active.refreshToken,
    projectId: active.projectId,
    revision: multi.revision,
    updatedAt: active.updatedAt,
    ...(active.email ? { email: active.email } : {}),
    ...(active.lineage ? { lineage: active.lineage } : {}),
  }
}

function commitAccount(
  current: AntigravityMultiAuthRecord | undefined,
  draft: AuthRecordDraft,
  now: number,
  forcedRevision?: number,
): AntigravityMultiAuthRecord {
  const email = draft.email ? validateEmail(draft.email) : undefined
  const id = email || draft.lineage || randomUUID()
  const label = draft.label || email || 'Google Account'
  const tier = draft.tier || 'Pro'
  const revision = forcedRevision ?? ((current?.revision ?? 0) + 1)
  const updatedAt = new Date(now).toISOString()
  const lineage = draft.lineage ?? randomUUID()

  const existingAccounts = current?.accounts ?? []
  const newAccount: AntigravityAccountRecord = {
    id,
    label,
    tier,
    ...(email ? { email } : {}),
    refreshToken: draft.refreshToken,
    projectId: draft.projectId,
    lineage,
    active: true,
    updatedAt,
  }

  const otherAccounts = existingAccounts
    .filter(acc => acc.id !== id && (!email || acc.email !== email))
    .map(acc => ({ ...acc, active: false }))

  return {
    version: MULTI_AUTH_RECORD_VERSION,
    activeId: id,
    accounts: [newAccount, ...otherAccounts],
    revision,
    updatedAt,
  }
}

function selectAccountRecord(
  multi: AntigravityMultiAuthRecord | undefined,
  id: string,
): AntigravityMultiAuthRecord | undefined {
  if (!multi || multi.accounts.length === 0) return undefined
  const target = multi.accounts.find(acc => acc.id === id)
  if (!target) return undefined
  const accounts = multi.accounts.map(acc => ({ ...acc, active: acc.id === id }))
  return {
    ...multi,
    activeId: id,
    accounts,
    updatedAt: new Date().toISOString(),
  }
}

function removeAccountRecord(
  multi: AntigravityMultiAuthRecord | undefined,
  id: string,
): AntigravityMultiAuthRecord | undefined {
  if (!multi) return undefined
  const remaining = multi.accounts.filter(acc => acc.id !== id)
  if (remaining.length === 0) return undefined
  let activeId = multi.activeId
  if (activeId === id) {
    activeId = remaining[0]!.id
  }
  const accounts = remaining.map(acc => ({ ...acc, active: acc.id === activeId }))
  return {
    ...multi,
    activeId,
    accounts,
    updatedAt: new Date().toISOString(),
  }
}

function parseMultiOrV1Record(value: unknown): AntigravityMultiAuthRecord {
  if (!isRecord(value)) throw corruptError()
  if (value.version === 1) {
    const v1 = value as unknown as AntigravityAuthRecord
    const email = typeof v1.email === 'string' ? validateEmail(v1.email) : undefined
    const id = email || v1.lineage || 'default'
    const account: AntigravityAccountRecord = {
      id,
      label: email || 'Google Account',
      ...(email ? { email } : {}),
      refreshToken: String(v1.refreshToken),
      projectId: String(v1.projectId),
      lineage: typeof v1.lineage === 'string' ? v1.lineage : undefined,
      active: true,
      updatedAt: typeof v1.updatedAt === 'string' ? v1.updatedAt : new Date().toISOString(),
    }
    return {
      version: MULTI_AUTH_RECORD_VERSION,
      activeId: id,
      accounts: [account],
      revision: Number(v1.revision) || 1,
      updatedAt: account.updatedAt,
    }
  }

  if (value.version === 2) {
    const raw = value as unknown as AntigravityMultiAuthRecord
    if (!Array.isArray(raw.accounts) || typeof raw.activeId !== 'string') throw corruptError()
    const accounts: AntigravityAccountRecord[] = raw.accounts.map(acc => {
      if (!isRecord(acc) || typeof acc.id !== 'string' || typeof acc.refreshToken !== 'string' || typeof acc.projectId !== 'string') {
        throw corruptError()
      }
      return {
        id: acc.id,
        label: typeof acc.label === 'string' ? acc.label : (typeof acc.email === 'string' ? acc.email : 'Google Account'),
        ...(typeof acc.email === 'string' ? { email: acc.email } : {}),
        refreshToken: acc.refreshToken,
        projectId: acc.projectId,
        lineage: typeof acc.lineage === 'string' ? acc.lineage : undefined,
        active: Boolean(acc.active),
        updatedAt: typeof acc.updatedAt === 'string' ? acc.updatedAt : new Date().toISOString(),
      }
    })
    return {
      version: MULTI_AUTH_RECORD_VERSION,
      activeId: raw.activeId,
      accounts,
      revision: Number(raw.revision) || 1,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    }
  }

  throw unsupportedVersionError()
}

export function makeAuthRecord(draft: AuthRecordDraft, revision: number, now = Date.now()): AntigravityAuthRecord {
  if (!isRecord(draft)
    || !isBoundedSafeText(draft.refreshToken, 4096)
    || !isBoundedSafeText(draft.projectId, 4096)
    || (draft.lineage !== undefined && !isBoundedSafeText(draft.lineage, 4096))
    || !Number.isSafeInteger(revision)
    || revision < 1
    || !Number.isFinite(now)) {
    throw corruptError()
  }
  return {
    version: AUTH_RECORD_VERSION,
    refreshToken: draft.refreshToken,
    projectId: draft.projectId,
    revision,
    updatedAt: new Date(now).toISOString(),
    lineage: draft.lineage ?? randomUUID(),
    ...(draft.email === undefined ? {} : { email: validateEmail(draft.email) }),
  }
}

async function assertOwnerOnly(path: string, platform: NodeJS.Platform): Promise<void> {
  try {
    const file = await lstat(path)
    const parent = await lstat(dirname(path))
    const unsafePosixMode = platform !== 'win32'
      && ((file.mode & 0o077) !== 0 || (parent.mode & 0o077) !== 0)
    if (file.isSymbolicLink() || parent.isSymbolicLink() || !parent.isDirectory() || unsafePosixMode) {
      throw unsafePermissionsError()
    }
  } catch (error) {
    if (error instanceof AuthStoreError) throw error
    throw storeIoError()
  }
}

function validateEmail(value: string): string {
  if (!isBoundedSafeText(value, 4096) || !value.includes('@')) throw corruptError()
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'EEXIST'
}

function corruptError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_CORRUPT', 'The Antigravity auth store file is corrupt')
}

function unsupportedVersionError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_UNSUPPORTED_VERSION', 'Unsupported auth store version')
}

function unsafePermissionsError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_UNSAFE_PERMISSIONS', 'The Antigravity auth store has unsafe permissions')
}

function conflictError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_CONFLICT', 'Could not acquire lock for Antigravity auth store')
}

function storeIoError(): AuthStoreError {
  return new AuthStoreError('AUTH_STORE_IO', 'Antigravity auth store I/O failed')
}
