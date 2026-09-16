/** Minimal local snapshot store shared by the provider integration modules. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'

export interface WritableSnapshotStore<T> extends SnapshotStore<T> {
  set(next: T): void
}

/** Create a tiny synchronous snapshot store owned by one plugin controller. */
export function createLocalStore<T>(initial: T): WritableSnapshotStore<T> {
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

export function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Narrow unknown JSON into a plain record. */
export function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}
