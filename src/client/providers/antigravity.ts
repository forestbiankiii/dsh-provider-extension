/** Client-half controller for Antigravity with multi-account support and quota monitoring. */

import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { createLocalStore, failureMessage, record } from '../store.ts'
import type { WritableSnapshotStore } from '../store.ts'
import { getCustomAccountLabel, saveCustomAccountLabel } from '../selection.ts'

export const ANTIGRAVITY_PROVIDER = 'google-antigravity' as const
export const ANTIGRAVITY_PACKAGE = 'dsh-antigravity-auth' as const
export const ANTIGRAVITY_PACKAGE_RANGE = '>=0.1.0' as const

export const ANTIGRAVITY_LOGIN_PHASES = [
  'idle',
  'pending',
  'success',
  'cancelled',
  'expired',
  'port-conflict',
  'failed',
] as const

export type AntigravityLoginPhase = (typeof ANTIGRAVITY_LOGIN_PHASES)[number]

export interface AntigravityLoginStatus {
  readonly phase: AntigravityLoginPhase
  readonly configured: boolean
  readonly projectAvailable: boolean
  readonly authorizationUrl?: string
  readonly expiresAt?: string
  readonly maskedEmail?: string
  readonly errorCode?: string
}

export interface AntigravityAccountView {
  readonly id: string
  readonly label: string
  readonly email?: string | undefined
  readonly tier?: string | undefined
  readonly active: boolean
}

export type AntigravityQuotaWindow = '5h' | 'weekly'

export interface AntigravityQuotaWindowView {
  readonly window: AntigravityQuotaWindow
  readonly remainingFraction: number
  readonly resetTime: string
}

export interface AntigravityQuotaGroupView {
  readonly group: 'gemini' | 'non-gemini'
  readonly modelCount: number
  readonly windows: readonly AntigravityQuotaWindowView[]
}

export interface AntigravityQuotaView {
  readonly state: string
  readonly checkedAt?: string
  readonly groups?: readonly AntigravityQuotaGroupView[]
}

export interface AntigravityModelEntry {
  readonly id: string
  readonly name: string
  readonly state: 'snapshot' | 'live-available' | 'unavailable'
}

export interface AntigravityModelCatalog {
  readonly state: 'snapshot' | 'live-available' | 'refresh-failed' | 'protocol-drift'
  readonly models: readonly AntigravityModelEntry[]
  readonly checkedAt?: string
}

export interface AntigravityStatus {
  readonly riskAcknowledged: boolean
  readonly login: AntigravityLoginStatus
}

export interface AntigravityState {
  /** `absent` means the companion bundle is not installed in this profile. */
  readonly status: 'idle' | 'checking' | 'ready' | 'absent' | 'error'
  readonly view?: AntigravityStatus | undefined
  readonly accounts: readonly AntigravityAccountView[]
  readonly models?: AntigravityModelCatalog | undefined
  readonly usage?: Readonly<Record<string, AntigravityQuotaView>> | undefined
  readonly error?: string | undefined
  /** True while a login or logout call is in flight. */
  readonly busy?: boolean | undefined
  /** True while the Host reports a pending browser login. */
  readonly loginPending?: boolean | undefined
  readonly switchingId?: string | undefined
}

interface RpcResult {
  readonly ok?: boolean
  readonly value?: unknown
  readonly error?: { readonly message?: unknown }
}

const initialState: AntigravityState = Object.freeze({
  status: 'idle',
  accounts: [],
  usage: {},
})

const ANTIGRAVITY_CACHE_KEY = 'dsh-provider-extension:antigravity-state-cache'

function loadCachedAntigravityState(): AntigravityState {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(ANTIGRAVITY_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AntigravityState>
        if (parsed?.view?.login?.configured) {
          return Object.freeze({
            status: 'ready',
            view: parsed.view,
            accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
            models: parsed.models,
            usage: parsed.usage && typeof parsed.usage === 'object' ? parsed.usage : {},
          })
        }
      }
    }
  } catch {}
  return initialState
}

function saveCachedAntigravityState(state: AntigravityState): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (state.status === 'ready' && state.view?.login?.configured) {
        window.localStorage.setItem(ANTIGRAVITY_CACHE_KEY, JSON.stringify({
          view: state.view,
          accounts: state.accounts,
          models: state.models,
          usage: state.usage,
        }))
      } else if (state.view?.login?.configured !== true) {
        window.localStorage.removeItem(ANTIGRAVITY_CACHE_KEY)
      }
    }
  } catch {}
}

/** Whether a model-directory route belongs to the Antigravity provider. */
export function isAntigravityProvider(provider: string | undefined): boolean {
  return provider !== undefined
    && (provider === ANTIGRAVITY_PROVIDER || provider.startsWith(`${ANTIGRAVITY_PROVIDER}-`))
}

function decodePhase(value: unknown): AntigravityLoginPhase | undefined {
  return typeof value === 'string' && (ANTIGRAVITY_LOGIN_PHASES as readonly string[]).includes(value)
    ? value as AntigravityLoginPhase
    : undefined
}

/** Decode one login status envelope, ignoring unknown optional fields. */
export function decodeLoginStatus(value: unknown): AntigravityLoginStatus | undefined {
  const candidate = record(value)
  if (candidate === undefined) return undefined
  const phase = decodePhase(candidate.phase)
  if (phase === undefined) return undefined
  if (typeof candidate.configured !== 'boolean' || typeof candidate.projectAvailable !== 'boolean') return undefined
  return Object.freeze({
    phase,
    configured: candidate.configured,
    projectAvailable: candidate.projectAvailable,
    ...typeof candidate.authorizationUrl === 'string' ? { authorizationUrl: candidate.authorizationUrl } : {},
    ...typeof candidate.expiresAt === 'string' ? { expiresAt: candidate.expiresAt } : {},
    ...typeof candidate.maskedEmail === 'string' ? { maskedEmail: candidate.maskedEmail } : {},
    ...typeof candidate.errorCode === 'string' ? { errorCode: candidate.errorCode } : {},
  })
}

/** Decode the whole status envelope; `pluginId` proves the companion answered. */
export function decodeStatus(value: unknown): AntigravityStatus | undefined {
  const root = record(value)
  const status = record(root?.status)
  if (status === undefined) return undefined
  if (status.pluginId !== ANTIGRAVITY_PACKAGE && status.pluginId !== 'dsh-provider-extension') return undefined
  const login = decodeLoginStatus(status.login)
  if (login === undefined) return undefined
  return Object.freeze({ riskAcknowledged: status.riskAcknowledged === true, login })
}

export function decodeAccounts(value: unknown): readonly AntigravityAccountView[] {
  const root = record(value)
  if (!root || !Array.isArray(root.accounts)) return []
  const accounts: AntigravityAccountView[] = []
  for (const raw of root.accounts) {
    const acc = record(raw)
    if (!acc || typeof acc.id !== 'string') continue
    const email = typeof acc.email === 'string' ? acc.email : undefined
    const customLabel = getCustomAccountLabel(acc.id, email)
    const baseLabel = typeof acc.label === 'string' ? acc.label : (email || 'Google Account')
    accounts.push(Object.freeze({
      id: acc.id,
      label: customLabel || baseLabel,
      ...(email !== undefined ? { email } : {}),
      ...(typeof acc.tier === 'string' && acc.tier.length > 0 ? { tier: acc.tier } : {}),
      active: Boolean(acc.active),
    }))
  }
  return Object.freeze(accounts)
}

export function decodeAntigravityQuota(value: unknown): AntigravityQuotaView | undefined {
  const root = record(value)
  if (!root || typeof root.state !== 'string') return undefined
  const groups: AntigravityQuotaGroupView[] = []
  if (Array.isArray(root.groups)) {
    for (const g of root.groups) {
      const groupRec = record(g)
      if (!groupRec) continue
      const groupName = groupRec.group === 'gemini' || groupRec.group === 'non-gemini' ? groupRec.group : undefined
      if (!groupName) continue
      const windows: AntigravityQuotaWindowView[] = []
      if (Array.isArray(groupRec.windows)) {
        for (const w of groupRec.windows) {
          const wRec = record(w)
          if (!wRec) continue
          const winName = wRec.window === '5h' || wRec.window === 'weekly' ? wRec.window : undefined
          const fraction = typeof wRec.remainingFraction === 'number' ? wRec.remainingFraction : undefined
          if (!winName || fraction === undefined) continue
          windows.push(Object.freeze({
            window: winName,
            remainingFraction: fraction,
            resetTime: String(wRec.resetTime || ''),
          }))
        }
      }
      groups.push(Object.freeze({
        group: groupName,
        modelCount: Number(groupRec.modelCount) || 0,
        windows: Object.freeze(windows),
      }))
    }
  }
  return Object.freeze({
    state: root.state,
    ...(typeof root.checkedAt === 'string' ? { checkedAt: root.checkedAt } : {}),
    groups: Object.freeze(groups),
  })
}

/** Decode the value-free advisory model catalog. */
export function decodeModels(value: unknown): AntigravityModelCatalog | undefined {
  const root = record(value)
  if (root === undefined) return undefined
  const states = ['snapshot', 'live-available', 'refresh-failed', 'protocol-drift'] as const
  const state = typeof root.state === 'string' && (states as readonly string[]).includes(root.state)
    ? root.state as AntigravityModelCatalog['state']
    : undefined
  if (state === undefined || !Array.isArray(root.models)) return undefined
  const models: AntigravityModelEntry[] = []
  for (const raw of root.models) {
    const model = record(raw)
    if (model === undefined) continue
    if (typeof model.id !== 'string' || model.id.length === 0) continue
    if (typeof model.name !== 'string' || model.name.length === 0) continue
    const availability = model.state === 'snapshot' || model.state === 'live-available' || model.state === 'unavailable'
      ? model.state
      : undefined
    if (availability === undefined) continue
    models.push(Object.freeze({ id: model.id, name: model.name, state: availability }))
  }
  return Object.freeze({
    state,
    models: Object.freeze(models),
    ...typeof root.checkedAt === 'string' ? { checkedAt: root.checkedAt } : {},
  })
}

/** Drive the companion bundle's guarded account RPC. */
export class AntigravityController {
  readonly store: WritableSnapshotStore<AntigravityState> = createLocalStore(loadCachedAntigravityState())
  private generation = 0
  private disposed = false

  constructor(private readonly rpc: ClientConnectionRpc) {}

  /** Read status, accounts, models, and quota. */
  async load(): Promise<void> {
    const generation = ++this.generation
    const current = this.store.getSnapshot()
    this.patch({
      status: current.view?.login?.configured ? 'ready' : 'checking',
      error: undefined,
    })
    try {
      const rawStatus = await this.callRaw('status', {})
      const status = decodeStatus(rawStatus)
      const accounts = decodeAccounts(rawStatus)
      if (this.disposed || generation !== this.generation) return
      if (status === undefined) throw new Error('Status envelope failed validation')

      const models = status.login.configured ? await this.readModels().catch(() => undefined) : undefined
      if (this.disposed || generation !== this.generation) return

      const nextState: AntigravityState = Object.freeze({
        status: 'ready',
        view: status,
        accounts: accounts.length > 0 ? accounts : (status.login.configured ? [{
          id: status.login.maskedEmail || 'default',
          label: status.login.maskedEmail || 'Google Account',
          email: status.login.maskedEmail,
          active: true,
        }] : []),
        error: undefined,
        loginPending: status.login.phase === 'pending',
        ...models === undefined ? {} : { models },
        ...current.usage === undefined ? {} : { usage: current.usage },
      })
      this.store.set(nextState)
      saveCachedAntigravityState(nextState)
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      this.patch({
        status: current.view?.login?.configured ? 'ready' : (isAbsent(error) ? 'absent' : 'error'),
        error: failureMessage(error),
      })
    }
  }

  /** Switch active Google account by id. */
  async selectAccount(id: string): Promise<void> {
    this.patch({ switchingId: id, error: undefined })
    try {
      const raw = await this.callRaw('account/select', { id })
      const accounts = decodeAccounts(raw)
      this.patch({ accounts, switchingId: undefined })
      await this.load()
    } catch (error) {
      this.patch({ switchingId: undefined, error: failureMessage(error) })
      throw error
    }
  }

  /** Remove one saved Google account. */
  async removeAccount(id: string): Promise<void> {
    this.patch({ switchingId: id, error: undefined })
    try {
      const raw = await this.callRaw('account/remove', { id })
      const accounts = decodeAccounts(raw)
      this.patch({ accounts, switchingId: undefined })
      await this.load()
    } catch (error) {
      this.patch({ switchingId: undefined, error: failureMessage(error) })
      throw error
    }
  }

  /** Update label or tier of one saved Google account. */
  async updateAccount(id: string, patch: { label?: string | undefined; tier?: string | undefined }): Promise<void> {
    try {
      const raw = await this.callRaw('account/update', { id, ...patch })
      const accounts = decodeAccounts(raw)
      this.patch({ accounts })
      saveCachedAntigravityState(this.store.getSnapshot())
    } catch (error) {
      this.patch({ error: failureMessage(error) })
      throw error
    }
  }

  /** Rename one saved Google account. */
  async renameAccount(id: string, label: string): Promise<void> {
    const current = this.store.getSnapshot()
    const target = current.accounts.find(a => a.id === id)
    saveCustomAccountLabel(id, target?.email, label)

    try {
      const raw = await this.callRaw('account/rename', { id, label })
      const accounts = decodeAccounts(raw)
      this.patch({ accounts })
      saveCachedAntigravityState(this.store.getSnapshot())
    } catch {
      // Keep optimistic rename with saved custom label
      const nextAccounts = current.accounts.map(a => a.id === id ? { ...a, label } : a)
      this.patch({ accounts: nextAccounts })
      saveCachedAntigravityState(this.store.getSnapshot())
    }
  }

  /** Read active or specified account quota/balance. */
  async readQuota(id?: string): Promise<void> {
    const current = this.store.getSnapshot()
    const active = current.accounts.find(a => a.active) ?? current.accounts[0]
    const targetId = id ?? active?.id ?? 'default'
    const isDifferent = active !== undefined && active.id !== targetId

    try {
      if (isDifferent) {
        await this.callRaw('account/select', { id: targetId })
      }
      const raw = await this.callRaw('usage', { force: true })
      const decoded = decodeAntigravityQuota(raw)
      if (decoded) {
        const latest = this.store.getSnapshot()
        const updatedUsage = Object.freeze({ ...latest.usage, [targetId]: decoded })
        this.patch({ usage: updatedUsage })
        saveCachedAntigravityState(this.store.getSnapshot())
      }
    } catch {
      // best-effort
    } finally {
      if (isDifferent && active) {
        await this.callRaw('account/select', { id: active.id }).catch(() => {})
      }
    }
  }

  /** Acknowledge the upstream risk notice and start the Google OAuth flow. */
  async login(): Promise<void> {
    const generation = ++this.generation
    this.patch({ busy: true, error: undefined })
    try {
      if (this.store.getSnapshot().view?.riskAcknowledged !== true) await this.callRaw('acknowledge-risk', { acknowledge: true })
      await this.callRaw('login', {})
      if (this.disposed || generation !== this.generation) return
      this.patch({ busy: false })
      await this.load()
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      this.patch({ busy: false, error: failureMessage(error) })
      throw error
    }
  }

  /** Drop the stored Antigravity credential. */
  async logout(): Promise<void> {
    const generation = ++this.generation
    this.patch({ busy: true, error: undefined })
    try {
      await this.callRaw('logout', {})
      if (this.disposed || generation !== this.generation) return
      this.patch({ busy: false, models: undefined, loginPending: false, accounts: [], usage: {} })
      saveCachedAntigravityState(initialState)
      await this.load()
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      this.patch({ busy: false, error: failureMessage(error) })
      throw error
    }
  }

  invalidate(): void {
    if (this.store.getSnapshot().status === 'idle') return
    void this.load()
  }

  dispose(): void {
    this.disposed = true
    ++this.generation
  }

  private async readStatus(): Promise<AntigravityStatus> {
    const envelope = await this.callRaw('status', {})
    const decoded = decodeStatus(envelope)
    if (decoded === undefined) throw new Error('Status envelope failed validation')
    return decoded
  }

  private async readModels(): Promise<AntigravityModelCatalog> {
    const envelope = await this.callRaw('models', {})
    const decoded = decodeModels(envelope)
    if (decoded === undefined) throw new Error('Model catalog envelope failed validation')
    return decoded
  }

  private patch(slice: Partial<AntigravityState>): void {
    const latest = this.store.getSnapshot()
    this.store.set(Object.freeze({ ...latest, ...slice }))
  }

  private async callRaw(endpoint: string, payload: unknown): Promise<unknown> {
    const response = await this.rpc.call('/api', `antigravity-auth/${endpoint}`, payload) as RpcResult
    if (response?.ok !== true) {
      const message = response?.error?.message
      throw new Error(typeof message === 'string' && message.length > 0 ? message : 'Antigravity service error')
    }
    return response.value
  }
}

function isAbsent(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('404')
      || error.message.includes('not found')
      || error.message.includes('unregistered')
      || error.message.includes('unavailable')
      || error.message.includes('unknown endpoint')
  }
  return false
}
