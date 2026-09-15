/** Optional, secret-free integration with dsh-codex-subscription 2.x account RPC. */

import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'

export interface CodexAccountView {
  readonly id: string
  readonly label: string
  readonly active: boolean
  readonly email?: string
}

export interface CodexAccountsState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly accounts: readonly CodexAccountView[]
  readonly error: string | null
  readonly switchingId?: string
}

interface WritableSnapshotStore<T> extends SnapshotStore<T> {
  set(next: T): void
}

interface RpcResult {
  readonly ok?: boolean
  readonly value?: unknown
  readonly error?: { readonly message?: unknown }
}

const initialState: CodexAccountsState = Object.freeze({ status: 'idle', accounts: [], error: null })

function createStore<T>(initial: T): WritableSnapshotStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update: (mutator) => {
      const draft = { ...(value as object) } as T
      mutator(draft)
      value = draft
      for (const listener of [...listeners]) listener()
    },
    set: (next) => {
      value = next
      for (const listener of [...listeners]) listener()
    },
  }
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function decodeAccount(value: unknown): CodexAccountView | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
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
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Codex account status')
  const raw = (value as Record<string, unknown>).accounts
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error('Invalid Codex account roster')
  const accounts = raw.map(decodeAccount)
  if (accounts.some(account => account === undefined)) throw new Error('Invalid Codex account entry')
  return Object.freeze(accounts as CodexAccountView[])
}

async function call(rpc: ClientConnectionRpc, endpoint: 'status' | 'account/select', payload: unknown): Promise<readonly CodexAccountView[]> {
  const response = await rpc.call('/api', `codex-subscription/${endpoint}`, payload) as RpcResult
  if (response?.ok !== true) {
    const message = response?.error?.message
    throw new Error(typeof message === 'string' && message.length > 0 ? message : 'Codex subscription account service is unavailable')
  }
  return decodeStatus(response.value)
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

/** Root-scoped account roster and true active-account switcher. */
export class CodexAccountsController {
  readonly store = createStore<CodexAccountsState>(initialState)
  private generation = 0
  private disposed = false

  constructor(private readonly rpc: ClientConnectionRpc) {}

  async load(): Promise<void> {
    if (this.store.getSnapshot().switchingId !== undefined) return
    const generation = ++this.generation
    const previous = this.store.getSnapshot()
    this.store.set(Object.freeze({ ...previous, status: 'loading', error: null }))
    try {
      const accounts = await call(this.rpc, 'status', {})
      if (this.disposed || generation !== this.generation) return
      this.store.set(Object.freeze({ status: 'ready', accounts, error: null }))
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      this.store.set(Object.freeze({ ...previous, status: 'error', error: failureMessage(error) }))
    }
  }

  async select(id: string): Promise<void> {
    const current = this.store.getSnapshot()
    if (current.switchingId !== undefined) throw new Error('Another account switch is still running')
    if (!current.accounts.some(account => account.id === id)) throw new Error('Unknown Codex account')
    if (current.accounts.find(account => account.id === id)?.active === true) return
    const generation = ++this.generation
    this.store.set(Object.freeze({ ...current, error: null, switchingId: id }))
    try {
      const accounts = await call(this.rpc, 'account/select', { id })
      if (this.disposed || generation !== this.generation) return
      this.store.set(Object.freeze({ status: 'ready', accounts, error: null }))
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.store.set(Object.freeze({ ...current, status: 'error', error: failureMessage(error) }))
      }
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
}
