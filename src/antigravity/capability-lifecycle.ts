/** Shared race-safe registration lifecycle for one independently gated capability row. */

import type { Context } from '@deepseek-ai/cordis'
import type { AntigravityStatusView, CapabilityRowId } from './status.ts'

export interface CapabilityStatusSource {
  status(): Promise<AntigravityStatusView>
  watchStatus?(listener: () => void): () => void
  dispose?(): Promise<void>
}

export interface CapabilityLifecycleOptions {
  readonly ctx: Context
  readonly auth: CapabilityStatusSource
  readonly id: CapabilityRowId
  readonly enabled: () => boolean
  /**
   * Register one capability row. Return a disposer, `undefined` when the host
   * service is not ready yet, or the `'retry'` sentinel when registration must
   * be attempted again shortly (for example while a previous plugin
   * generation's adapter is still winding down after a live reload).
   */
  readonly register: () => (() => void) | 'retry' | undefined
  readonly ownsAuth?: boolean
  readonly cleanup?: () => void | Promise<void>
  readonly label: string
}

export interface CapabilityLifecycle {
  sync(): void
  refresh(): Promise<void>
}

/** Register a capability set atomically and dispose every owned member best-effort. */
export function registerCapabilitySet<T>(
  values: readonly T[],
  register: (value: T) => () => void,
): () => void {
  const disposers: Array<() => void> = []
  const disposeAll = (): void => {
    for (const dispose of disposers.splice(0).reverse()) {
      try { dispose() } catch { /* continue releasing the rest of the owned set */ }
    }
  }
  try {
    for (const value of values) disposers.push(register(value))
  } catch (error) {
    disposeAll()
    throw error
  }
  return disposeAll
}

const RETRY_DELAY_MS = 2_500
const MAX_RETRY_ATTEMPTS = 12
const SAFETY_REFRESH_INTERVAL_MS = 60_000

export function mountCapabilityLifecycle(options: CapabilityLifecycleOptions): CapabilityLifecycle {
  let gateReady = false
  let registration: (() => void) | undefined
  let generation = 0
  let disposed = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryAttempts = 0

  const clearRetry = (): void => {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }
  }

  const scheduleRetry = (): void => {
    if (disposed || retryTimer !== undefined) return
    if (retryAttempts >= MAX_RETRY_ATTEMPTS) return
    retryAttempts += 1
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      sync()
    }, RETRY_DELAY_MS)
  }

  const sync = (): void => {
    if (disposed) return
    const shouldRegister = options.enabled() && gateReady
    if (shouldRegister && registration === undefined) {
      let outcome: (() => void) | 'retry' | undefined
      try {
        outcome = options.register()
      } catch {
        // A throwing host registration is retried on a short backoff instead of
        // silently staying unregistered until the next status notification.
        outcome = 'retry'
      }
      if (outcome === 'retry') {
        scheduleRetry()
        return
      }
      registration = outcome
      retryAttempts = 0
    } else if (!shouldRegister && registration !== undefined) {
      const dispose = registration
      registration = undefined
      clearRetry()
      retryAttempts = 0
      try { dispose() } catch { /* a broken public disposer cannot retain plugin ownership */ }
    }
  }

  const refresh = async (): Promise<void> => {
    const currentGeneration = ++generation
    let ready: boolean
    try {
      const status = await options.auth.status()
      ready = status.login.projectAvailable
        && status.capabilities.some(capability => capability.id === options.id && capability.state === 'available')
    } catch {
      // A transient status failure must never tear down a working
      // registration; the periodic safety refresh re-evaluates shortly.
      return
    }
    if (disposed || currentGeneration !== generation) return
    gateReady = ready
    sync()
  }

  const unwatch = options.auth.watchStatus?.(() => { void refresh() }) ?? (() => {})
  const safetyTimer = setInterval(() => { if (!disposed) void refresh() }, SAFETY_REFRESH_INTERVAL_MS)
  const lifecycle = options.ctx as unknown as { effect?: (setup: () => () => Promise<void>, label?: string) => unknown }
  lifecycle.effect?.(() => async () => {
    if (disposed) return
    disposed = true
    generation += 1
    clearRetry()
    clearInterval(safetyTimer)
    try { unwatch() } finally {
      const dispose = registration
      registration = undefined
      try { dispose?.() } finally {
        try { await options.cleanup?.() } finally {
          if (options.ownsAuth) await options.auth.dispose?.()
        }
      }
    }
  }, options.label)
  sync()
  void refresh()
  return { sync, refresh }
}
