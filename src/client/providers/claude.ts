/** CLI-owned Claude identity; no credential fields or persistent browser account cache. */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ClaudeStatus } from '../../claude/service.ts'
import { createLocalStore, record } from '../store.ts'
import { MODELS_VISIBILITY_EVENT } from '../selection.ts'
const CLAUDE_ENABLED_MODELS_KEY = 'dsh-provider-extension:claude-cli-enabled-models'
export function claudeEnabledModels(): Set<string> | undefined {
  try {
    const raw = window.localStorage.getItem(CLAUDE_ENABLED_MODELS_KEY)
    if (raw === null) return undefined
    const value: unknown = JSON.parse(raw)
    if (Array.isArray(value) && value.every(id => typeof id === 'string')) return new Set(value)
  } catch {}
  return undefined
}
export function saveClaudeEnabledModels(models: Set<string>): void {
  window.localStorage.setItem(CLAUDE_ENABLED_MODELS_KEY, JSON.stringify([...models]))
  window.dispatchEvent(new Event(MODELS_VISIBILITY_EVENT))
}
export interface ClaudeClientState {
  status: ClaudeStatus['status'] | 'idle' | 'checking'
  label: string | null
  plan: string | null
  authMethod: string | null
  errorCode: string | null
  loginStarted: boolean
}
export class ClaudeController {
  readonly store = createLocalStore<ClaudeClientState>({ status: 'idle', label: null, plan: null, authMethod: null, errorCode: null, loginStarted: false })
  private readonly lifetime = new AbortController()
  private generation = 0
  constructor(private readonly rpc: ClientConnectionRpc) {}
  private async call(endpoint: string): Promise<unknown> {
    const result = await this.rpc.call('/api', `claude-subscription/${endpoint}`, {}, this.lifetime.signal)
    if (!result.ok) throw new Error('Claude CLI operation failed')
    return result.value
  }
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.set({ ...this.store.getSnapshot(), status: 'checking', errorCode: null })
    try {
      const value = record(await this.call('status'))
      if (!value || !['ready', 'signed-out', 'missing', 'failed'].includes(String(value.status))) throw new Error('Invalid Claude CLI status')
      if (this.lifetime.signal.aborted || generation !== this.generation) return
      this.store.set({ status: value.status as ClaudeStatus['status'], label: typeof value.label === 'string' ? value.label.slice(0, 128) : null,
        plan: typeof value.plan === 'string' ? value.plan.slice(0, 32) : null, authMethod: typeof value.authMethod === 'string' ? value.authMethod.slice(0, 32) : null,
        errorCode: typeof value.errorCode === 'string' ? value.errorCode.slice(0, 32) : null, loginStarted: false })
    } catch {
      if (!this.lifetime.signal.aborted && generation === this.generation) this.store.set({ ...this.store.getSnapshot(), status: 'failed', errorCode: 'cli-failed' })
    }
  }
  async login(): Promise<void> {
    try {
      await this.call('login/start')
      if (!this.lifetime.signal.aborted) this.store.set({ ...this.store.getSnapshot(), loginStarted: true, errorCode: null })
    } catch {
      if (!this.lifetime.signal.aborted) this.store.set({ ...this.store.getSnapshot(), errorCode: 'login-launch-failed' })
    }
  }
  async models(): Promise<readonly { id: string; name: string }[]> {
    const value = await this.call('models')
    if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid Claude CLI models')
    return value.map(entry => {
      const row = record(entry)
      if (typeof row?.id !== 'string' || typeof row.name !== 'string') throw new Error('Invalid Claude CLI model')
      return { id: row.id, name: row.name }
    })
  }
  dispose(): void { this.generation++; this.lifetime.abort() }
}
