/**
 * Optional integration with the published `dsh-antigravity-auth` capability bundle.
 *
 * That bundle owns the Antigravity OAuth flow, the wire identity, and the LLM
 * adapter that publishes Antigravity model routes into the shared model
 * directory. This module only drives its loopback-guarded account RPC and never
 * handles tokens: the browser receives phases, a login URL, a masked email, and
 * a value-free model catalog.
 */

import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { createLocalStore, failureMessage, record, type WritableSnapshotStore } from '../store.ts'

/** Provider route the upstream adapter registers. */
export const ANTIGRAVITY_PROVIDER = 'google-antigravity'
/** Package the companion bundle is published as. */
export const ANTIGRAVITY_PACKAGE = 'dsh-antigravity-auth'
/**
 * Account RPC namespace on the shared `/api` channel. It is intentionally not
 * the package name: the companion registers the shorter `antigravity-auth`.
 */
export const ANTIGRAVITY_RPC_NAMESPACE = 'antigravity-auth'
/** npm range this integration was written against. */
export const ANTIGRAVITY_PACKAGE_RANGE = '0.1.4-rc.1'

export const ANTIGRAVITY_LOGIN_PHASES = [
  'idle', 'pending', 'success', 'cancelled', 'expired', 'port-conflict', 'failed',
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
  readonly models?: AntigravityModelCatalog | undefined
  readonly error?: string | undefined
  /** True while a login or logout call is in flight. */
  readonly busy?: boolean | undefined
  /** True while the Host reports a pending browser login. */
  readonly loginPending?: boolean | undefined
}

interface RpcResult {
  readonly ok?: boolean
  readonly value?: unknown
  readonly error?: { readonly message?: unknown }
}

const initialState: AntigravityState = Object.freeze({ status: 'idle' })

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
  if (status.pluginId !== ANTIGRAVITY_PACKAGE) return undefined
  const login = decodeLoginStatus(status.login)
  if (login === undefined) return undefined
  return Object.freeze({ riskAcknowledged: status.riskAcknowledged === true, login })
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
  readonly store: WritableSnapshotStore<AntigravityState> = createLocalStore(initialState)
  private generation = 0
  private disposed = false

  constructor(private readonly rpc: ClientConnectionRpc) {}

  /** Read status and (when available) the model catalog. */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.patch({ status: 'checking', error: undefined })
    try {
      const status = await this.readStatus()
      if (this.disposed || generation !== this.generation) return
      const models = status.login.configured ? await this.readModels().catch(() => undefined) : undefined
      if (this.disposed || generation !== this.generation) return
      this.patch({
        status: 'ready',
        view: status,
        error: undefined,
        loginPending: status.login.phase === 'pending',
        ...models === undefined ? {} : { models },
      })
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      this.patch({ status: isAbsent(error) ? 'absent' : 'error', error: failureMessage(error) })
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
      this.patch({ busy: false, models: undefined, loginPending: false })
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

  private patch(patch: Partial<AntigravityState>): void {
    const next: Record<string, unknown> = { ...this.store.getSnapshot(), ...patch }
    for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key]
    this.store.set(Object.freeze(next) as unknown as AntigravityState)
  }

  private async readStatus(): Promise<AntigravityStatus> {
    const status = decodeStatus(await this.callRaw('status', {}))
    if (status === undefined) throw new Error('Investigate: invalid Antigravity status payload')
    return status
  }

  private async readModels(): Promise<AntigravityModelCatalog> {
    const models = decodeModels(await this.callRaw('models', { force: false }))
    if (models === undefined) throw new Error('Investigate: invalid Antigravity model catalog')
    return models
  }

  private async callRaw(
    endpoint: 'status' | 'models' | 'login' | 'logout' | 'acknowledge-risk',
    payload: unknown,
  ): Promise<unknown> {
    const response = await this.rpc.call('/api', `${ANTIGRAVITY_RPC_NAMESPACE}/${endpoint}`, payload) as RpcResult
    if (response?.ok !== true) {
      const message = response?.error?.message
      throw new Error(typeof message === 'string' && message.length > 0 ? message : 'Antigravity account service is unavailable')
    }
    return response.value
  }
}

/** Treat a missing channel as "companion not installed" rather than a failure. */
function isAbsent(error: unknown): boolean {
  const message = failureMessage(error).toLowerCase()
  return message.includes('unknown') || message.includes('not found') || message.includes('unavailable')
}
