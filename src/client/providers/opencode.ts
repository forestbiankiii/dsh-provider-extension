/** OpenCode Go client-side controller: configuration, live catalog models, usage polling, and persistence. */

import { createLocalStore, failureMessage } from '../store.ts'
import {
  getDisabledModelsForAccount,
  saveAccountDisabledModels,
  loadAccountDisabledModels,
} from '../selection.ts'

export const DEFAULT_OPENCODE_BASE_URL: string = 'https://opencode.ai/zen/go/v1'
export const OPENCODE_API_KEY_STORAGE_KEY = 'dsh-provider-extension:opencode-api-key'
export const OPENCODE_BASE_URL_STORAGE_KEY = 'dsh-provider-extension:opencode-base-url'

export interface OpencodeUsageWindow {
  readonly status: 'ok' | 'rate-limited'
  readonly percent: number
  readonly resetsAt: string
}

export interface OpencodeUsageData {
  readonly rolling?: OpencodeUsageWindow | undefined
  readonly weekly?: OpencodeUsageWindow | undefined
  readonly monthly?: OpencodeUsageWindow | undefined
}

export interface OpencodeModelView {
  readonly id: string
  readonly name: string
  readonly contextWindow?: number | undefined
  readonly maxOutput?: number | undefined
}

export interface OpencodeState {
  readonly apiKey: string
  readonly baseURL: string
  readonly configured: boolean
  readonly usage?: OpencodeUsageData | undefined
  readonly usageStatus: 'idle' | 'loading' | 'ready' | 'error'
  readonly usageError?: string | undefined
  readonly models: readonly OpencodeModelView[]
  readonly modelsStatus: 'idle' | 'loading' | 'ready' | 'error'
}

export const DEFAULT_OPENCODE_MODELS: readonly OpencodeModelView[] = [
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
  { id: 'deepseek-v4.1-coder', name: 'DeepSeek V4.1 Coder' },
  { id: 'deepseek-r1', name: 'DeepSeek R1' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'o1', name: 'o1' },
  { id: 'o3-mini', name: 'o3-mini' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
]

export function isOpencodeProvider(provider?: string): boolean {
  return provider !== undefined && (provider === 'opencode-go' || provider === 'opencode' || provider.startsWith('opencode'))
}

export class OpencodeController {
  readonly store = createLocalStore<OpencodeState>({
    apiKey: '',
    baseURL: DEFAULT_OPENCODE_BASE_URL,
    configured: false,
    usageStatus: 'idle',
    models: DEFAULT_OPENCODE_MODELS,
    modelsStatus: 'idle',
  })

  private disposed = false

  constructor() {
    this.initFromStorage()
  }

  dispose(): void {
    this.disposed = true
  }

  private initFromStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const apiKey = window.localStorage.getItem(OPENCODE_API_KEY_STORAGE_KEY) || ''
        const baseURL = window.localStorage.getItem(OPENCODE_BASE_URL_STORAGE_KEY) || DEFAULT_OPENCODE_BASE_URL
        this.store.set(Object.freeze({
          ...this.store.getSnapshot(),
          apiKey,
          baseURL,
          configured: apiKey.trim().length > 0,
        }))
      }
    } catch {}
  }

  saveConfig(apiKey: string, baseURL: string = DEFAULT_OPENCODE_BASE_URL): void {
    const trimmedKey = apiKey.trim()
    const trimmedURL = (baseURL.trim() || DEFAULT_OPENCODE_BASE_URL).replace(/\/+$/, '')
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(OPENCODE_API_KEY_STORAGE_KEY, trimmedKey)
        window.localStorage.setItem(OPENCODE_BASE_URL_STORAGE_KEY, trimmedURL)
      }
    } catch {}

    this.store.set(Object.freeze({
      ...this.store.getSnapshot(),
      apiKey: trimmedKey,
      baseURL: trimmedURL,
      configured: trimmedKey.length > 0,
    }))

    if (trimmedKey.length > 0) {
      void this.readUsage()
      void this.refreshModels()
    }
  }

  async readUsage(): Promise<void> {
    const current = this.store.getSnapshot()
    if (!current.apiKey) return

    this.store.set(Object.freeze({ ...current, usageStatus: 'loading', usageError: undefined }))
    try {
      const endpoint = `${current.baseURL}/usage`
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${current.apiKey}`,
          Accept: 'application/json',
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as Record<string, unknown>
      const usage = data && typeof data === 'object' ? (data.usage as OpencodeUsageData ?? data as OpencodeUsageData) : undefined

      if (!this.disposed) {
        this.store.set(Object.freeze({
          ...this.store.getSnapshot(),
          usage,
          usageStatus: 'ready',
          usageError: undefined,
        }))
      }
    } catch (err) {
      if (!this.disposed) {
        this.store.set(Object.freeze({
          ...this.store.getSnapshot(),
          usageStatus: 'error',
          usageError: failureMessage(err),
        }))
      }
    }
  }

  async refreshModels(): Promise<void> {
    const current = this.store.getSnapshot()
    this.store.set(Object.freeze({ ...current, modelsStatus: 'loading' }))
    try {
      const endpoint = `${current.baseURL}/models`
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (current.apiKey) headers['Authorization'] = `Bearer ${current.apiKey}`
      const res = await fetch(endpoint, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { data?: unknown[] }
      if (Array.isArray(json.data) && json.data.length > 0) {
        const fetched = json.data.map((item: any) => ({
          id: item.id || item.name,
          name: item.name || item.id,
          contextWindow: item.context_length ?? item.context_window,
          maxOutput: item.max_output ?? item.max_tokens,
        }))
        if (!this.disposed) {
          this.store.set(Object.freeze({
            ...this.store.getSnapshot(),
            models: fetched,
            modelsStatus: 'ready',
          }))
          return
        }
      }
    } catch {}

    if (!this.disposed) {
      this.store.set(Object.freeze({
        ...this.store.getSnapshot(),
        modelsStatus: 'ready',
      }))
    }
  }
}
