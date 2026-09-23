/** Optional, secret-free integration with dsh-codex-subscription 2.x account and quota RPC. */

import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { createLocalStore, failureMessage, record } from '../store.ts'

export interface CodexAccountView {
  readonly id: string
  readonly label: string
  readonly active: boolean
  readonly email?: string
}

/** Quota windows the subscription plugin reported for one account. */
export interface CodexQuotaView {
  /** Remaining percent of the weekly (604800s) window, when reported. */
  readonly weeklyPercent?: number
  /** Unix seconds when that weekly window resets, when reported. */
  readonly weeklyResetsAt?: number
  /** Remaining percent of the 5-hour (18000s) window, when reported. */
  readonly shortPercent?: number
}

export type CodexUsageState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: CodexQuotaView }
  | { readonly status: 'error'; readonly message: string }

export interface CodexAccountsState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly accounts: readonly CodexAccountView[]
  readonly error: string | null
  /** Account id of an in-flight switch or quota read. */
  readonly switchingId?: string | undefined
  /** Per-account quota, keyed by account id. */
  readonly usage: Readonly<Record<string, CodexUsageState>>
  /** True when a temporary switch could not be reverted to the previous account. */
  readonly restoreFailed: boolean
  readonly loginPending?: boolean | undefined
  readonly loginUrl?: string | undefined
}

interface RpcResult {
  readonly ok?: boolean
  readonly value?: unknown
  readonly error?: { readonly message?: unknown }
}

const WEEK_SECONDS = 604_800
const SHORT_WINDOW_SECONDS = 18_000

const initialState: CodexAccountsState = Object.freeze({
  status: 'idle', accounts: [], error: null, usage: {}, restoreFailed: false,
})

const CODEX_CACHE_KEY = 'dsh-provider-extension:codex-accounts-cache'

function loadCachedCodexState(): CodexAccountsState {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(CODEX_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CodexAccountsState>
        if (Array.isArray(parsed?.accounts) && parsed.accounts.length > 0) {
          return Object.freeze({
            status: 'ready',
            accounts: parsed.accounts,
            error: null,
            usage: parsed.usage && typeof parsed.usage === 'object' ? parsed.usage : {},
            restoreFailed: false,
          })
        }
      }
    }
  } catch {}
  return initialState
}

function saveCachedCodexState(state: CodexAccountsState): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (state.status === 'ready' && state.accounts.length > 0) {
        window.localStorage.setItem(CODEX_CACHE_KEY, JSON.stringify({
          accounts: state.accounts,
          usage: state.usage,
        }))
      }
    }
  } catch {}
}

/** Shared loading marker, typed so object spreads keep the discriminated union. */
const LOADING: CodexUsageState = Object.freeze({ status: 'loading' })

function decodeAccount(value: unknown): CodexAccountView | undefined {
  const candidate = record(value)
  if (candidate === undefined) return undefined
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return undefined
  if (typeof candidate.label !== 'string' || candidate.label.length === 0) return undefined
  if (typeof candidate.active !== 'boolean') return undefined
  return Object.freeze({
    id: candidate.id,
    label: candidate.label,
    active: candidate.active,
    ...typeof candidate.email === 'string' && candidate.email.length > 0 ? { email: candidate.email } : {},
  })
}

function decodeStatus(value: unknown): readonly CodexAccountView[] {
  const root = record(value)
  if (root === undefined) throw new Error('Invalid Codex account status')
  const raw = root.accounts
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error('Invalid Codex account roster')
  const accounts = raw.map(decodeAccount)
  if (accounts.some(account => account === undefined)) throw new Error('Invalid Codex account entry')
  return Object.freeze(accounts as CodexAccountView[])
}

/**
 * Read the reported quota windows out of one `usage` response.
 * Only provider-reported values are returned; nothing is inferred.
 * @param value - the `codex-subscription/usage` payload.
 * @returns the weekly and 5-hour windows when the account reported them.
 */
export function decodeQuota(value: unknown): CodexQuotaView {
  const root = record(value)
  const limits = Array.isArray(root?.rateLimits) ? root.rateLimits : []
  const described = limits.map(record).filter((limit): limit is Record<string, unknown> => limit !== undefined)
  const withWindows = described.filter(limit => Array.isArray(limit.windows))
  const codex = withWindows.find(limit => limit.id === 'codex') ?? withWindows[0]
  const windows = Array.isArray(codex?.windows) ? codex.windows : []
  let weeklyPercent: number | undefined
  let weeklyResetsAt: number | undefined
  let shortPercent: number | undefined
  for (const raw of windows) {
    const window = record(raw)
    if (window === undefined) continue
    const seconds = Number(window.windowSeconds)
    const percent = Number(window.remainingPercent)
    if (!Number.isFinite(seconds) || seconds <= 0) continue
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) continue
    if (Math.abs(seconds - WEEK_SECONDS) < 60 && weeklyPercent === undefined) {
      weeklyPercent = Math.round(percent)
      if (Number.isSafeInteger(window.resetsAt)) weeklyResetsAt = window.resetsAt as number
      continue
    }
    if (Math.abs(seconds - SHORT_WINDOW_SECONDS) < 60 && shortPercent === undefined) shortPercent = Math.round(percent)
  }
  return Object.freeze({
    ...weeklyPercent === undefined ? {} : { weeklyPercent },
    ...weeklyResetsAt === undefined ? {} : { weeklyResetsAt },
    ...shortPercent === undefined ? {} : { shortPercent },
  })
}

async function call(
  rpc: ClientConnectionRpc,
  endpoint: 'status' | 'account/select' | 'account/remove' | 'usage' | 'login/start' | 'login/status' | 'login/cancel',
  payload: unknown,
): Promise<unknown> {
  const response = await rpc.call('/api', `codex-subscription/${endpoint}`, payload) as RpcResult
  if (response?.ok !== true) {
    const message = response?.error?.message
    throw new Error(typeof message === 'string' && message.length > 0
      ? message : 'Codex subscription service is unavailable')
  }
  return response.value
}

async function readRoster(rpc: ClientConnectionRpc, endpoint: 'status' | 'account/select', payload: unknown): Promise<readonly CodexAccountView[]> {
  return decodeStatus(await call(rpc, endpoint, payload))
}

/** Whether a model-directory route belongs to the Codex subscription provider. */
export function isCodexProvider(provider: string | undefined): boolean {
  return provider !== undefined && (provider === 'openai-codex' || provider.startsWith('openai-codex-'))
}

/** Hide account email local parts in the composer while keeping rows distinguishable. */
export function maskedEmail(email: string | undefined): string | undefined {
  if (email === undefined) return undefined
  const at = email.indexOf('@')
  if (at <= 0 || at === email.length - 1) return undefined
  const local = email.slice(0, at)
  return `${local.slice(0, Math.min(2, local.length))}***@${email.slice(at + 1)}`
}

/**
 * Root-scoped Codex account roster, real active-account switching, and quota reads.
 *
 * The upstream `usage` endpoint only reports the currently active account, so a
 * non-active account's quota needs a temporary switch that is reverted immediately.
 */
export class CodexAccountsController {
  readonly store = createLocalStore<CodexAccountsState>(loadCachedCodexState())
  private generation = 0
  private disposed = false

  constructor(private readonly rpc: ClientConnectionRpc) {}

  /** Load the roster, then read the active account's quota. */
  async load(): Promise<void> {
    if (this.store.getSnapshot().switchingId !== undefined) return
    const generation = ++this.generation
    const previous = this.store.getSnapshot()
    this.store.set(Object.freeze({
      ...previous,
      status: previous.accounts.length > 0 ? 'ready' : 'loading',
      error: null,
      restoreFailed: false,
    }))
    try {
      const accounts = await readRoster(this.rpc, 'status', {})
      if (this.disposed || generation !== this.generation) return
      const latest = this.store.getSnapshot()
      const nextState: CodexAccountsState = Object.freeze({ ...latest, status: 'ready', accounts, error: null })
      this.store.set(nextState)
      saveCachedCodexState(nextState)
      void this.loadUsage(generation)
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      const latest = this.store.getSnapshot()
      this.store.set(Object.freeze({
        ...latest,
        status: latest.accounts.length > 0 ? 'ready' : 'error',
        error: failureMessage(error),
      }))
    }
  }

  /**
   * Read the active account's quota. Never changes which account is active.
   * @param generation - operation allowed to publish the result.
   */
  async loadUsage(generation = this.generation): Promise<void> {
    const active = this.store.getSnapshot().accounts.find(account => account.active)
    if (active === undefined) return
    this.setUsage(active.id, LOADING)
    try {
      const value = decodeQuota(await call(this.rpc, 'usage', { force: false }))
      if (this.disposed || generation !== this.generation) return
      this.setUsage(active.id, { status: 'ready', value })
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      this.setUsage(active.id, { status: 'error', message: failureMessage(error) })
    }
  }

  /** Permanently switch the active account and read its quota. */
  async select(id: string): Promise<void> {
    const current = this.store.getSnapshot()
    if (current.switchingId !== undefined) throw new Error('Another account operation is still running')
    if (!current.accounts.some(account => account.id === id)) throw new Error('Unknown Codex account')
    if (current.accounts.find(account => account.id === id)?.active === true) return
    const generation = ++this.generation
    this.store.set(Object.freeze({
      ...current, error: null, switchingId: id, usage: { ...current.usage, [id]: LOADING },
    }))
    try {
      await this.switchTo(id, generation)
      if (this.disposed || generation !== this.generation) return
      const latest = this.store.getSnapshot()
      this.store.set(Object.freeze({ ...latest, status: 'ready', error: null, switchingId: undefined }))
      void this.loadUsage(generation)
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        const latest = this.store.getSnapshot()
        this.store.set(Object.freeze({ ...latest, status: 'error', switchingId: undefined, error: failureMessage(error) }))
      }
      throw error
    }
  }

  /**
   * Read one account's quota, switching to it first and restoring the previous
   * account immediately afterwards. The active account is left unchanged unless
   * the restore itself fails, which the state then reports.
   * @param id - DSH-local account identity to measure.
   */
  async readQuota(id: string): Promise<void> {
    const current = this.store.getSnapshot()
    if (current.switchingId !== undefined) throw new Error('Another account operation is still running')
    const target = current.accounts.find(account => account.id === id)
    if (target === undefined) throw new Error('Unknown Codex account')
    if (target.active) {
      await this.loadUsage()
      return
    }
    const origin = current.accounts.find(account => account.active)?.id
    const generation = ++this.generation
    this.store.set(Object.freeze({
      ...current,
      error: null,
      restoreFailed: false,
      switchingId: id,
      usage: { ...current.usage, [id]: LOADING },
    }))
    let failure: unknown
    try {
      await this.switchTo(id, generation)
      const value = decodeQuota(await call(this.rpc, 'usage', { force: false }))
      if (!this.disposed && generation === this.generation) this.setUsage(id, { status: 'ready', value })
    } catch (error) {
      failure = error
      if (!this.disposed && generation === this.generation) {
        this.setUsage(id, { status: 'error', message: failureMessage(error) })
      }
    } finally {
      let restored = origin === undefined
      if (origin !== undefined) {
        try {
          await this.switchTo(origin, generation)
          restored = true
        } catch {
          restored = false
        }
      }
      if (!this.disposed && generation === this.generation) {
        const latest = this.store.getSnapshot()
        this.store.set(Object.freeze({ ...latest, switchingId: undefined, restoreFailed: !restored }))
      }
    }
    if (failure !== undefined) throw failure
  }

  /** Start interactive ChatGPT OAuth login and wait for completion. */
  async login(): Promise<void> {
    const current = this.store.getSnapshot()
    if (current.loginPending) return
    this.store.set(Object.freeze({ ...current, loginPending: true, error: null }))
    try {
      const nextIndex = current.accounts.length + 1
      const startResult = await call(this.rpc, 'login/start', { openExternal: true, label: `Account ${nextIndex}` }) as { id?: string; authUrl?: string }
      const flowId = startResult?.id
      if (typeof flowId !== 'string') throw new Error('Could not start ChatGPT login')
      const latest = this.store.getSnapshot()
      this.store.set(Object.freeze({ ...latest, loginPending: true, loginUrl: startResult.authUrl }))

      const poll = async (): Promise<void> => {
        if (this.disposed) return
        try {
          const status = await call(this.rpc, 'login/status', { id: flowId }) as { authenticated?: boolean; phase?: string; error?: string }
          if (status?.authenticated === true) {
            window.dispatchEvent(new Event('dsh-codex-subscription:refresh-quick-quota'))
            await this.load()
            const s = this.store.getSnapshot()
            this.store.set(Object.freeze({ ...s, loginPending: false, loginUrl: undefined }))
            return
          }
          if (status?.phase === 'cancelled' || status?.phase === 'failed' || status?.phase === 'expired') {
            const s = this.store.getSnapshot()
            this.store.set(Object.freeze({
              ...s,
              loginPending: false,
              loginUrl: undefined,
              error: status.error ?? status.phase,
            }))
            return
          }
        } catch {}
        setTimeout(poll, 1500)
      }
      setTimeout(poll, 1500)
    } catch (error) {
      const latest = this.store.getSnapshot()
      this.store.set(Object.freeze({ ...latest, loginPending: false, loginUrl: undefined, error: failureMessage(error) }))
    }
  }

  /** Rename one saved ChatGPT account. */
  async renameAccount(id: string, label: string): Promise<void> {
    const current = this.store.getSnapshot()
    const nextAccounts = current.accounts.map(acc => acc.id === id ? { ...acc, label } : acc)
    const nextState = Object.freeze({ ...current, accounts: nextAccounts })
    this.store.set(nextState)
    saveCachedCodexState(nextState)

    try {
      const accounts = await readRoster(this.rpc, 'account/rename' as any, { id, label })
      if (!this.disposed) {
        this.store.set(Object.freeze({ ...this.store.getSnapshot(), accounts }))
      }
    } catch {
      // Keep optimistic rename
    }
  }

  /** Remove one saved ChatGPT account. */
  async removeAccount(id: string): Promise<void> {
    const current = this.store.getSnapshot()
    this.store.set(Object.freeze({ ...current, switchingId: id, error: null }))
    try {
      await call(this.rpc, 'account/remove', { id })
      window.dispatchEvent(new Event('dsh-codex-subscription:refresh-quick-quota'))
      await this.load()
    } catch (error) {
      const latest = this.store.getSnapshot()
      this.store.set(Object.freeze({ ...latest, switchingId: undefined, error: failureMessage(error) }))
      throw error
    }
  }

  /** Reload the roster only when a surface already asked for it. */
  invalidate(): void {
    if (this.store.getSnapshot().status === 'idle') return
    void this.load()
  }

  dispose(): void {
    this.disposed = true
    ++this.generation
  }

  private async switchTo(id: string, generation: number): Promise<void> {
    const accounts = await readRoster(this.rpc, 'account/select', { id })
    if (this.disposed || generation !== this.generation) return
    const latest = this.store.getSnapshot()
    this.store.set(Object.freeze({ ...latest, accounts }))
  }

  private setUsage(id: string, value: CodexUsageState): void {
    const latest = this.store.getSnapshot()
    const nextState = Object.freeze({ ...latest, usage: { ...latest.usage, [id]: value } })
    this.store.set(nextState)
    saveCachedCodexState(nextState)
  }
}
