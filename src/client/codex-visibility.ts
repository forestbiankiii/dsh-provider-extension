/** Account-scoped Codex visibility. Catalog membership still comes from the Host. */
import { loadAccountDisabledModels, MODELS_VISIBILITY_EVENT } from './selection.ts'

export const CODEX_ENABLED_MODELS_KEY = 'dsh-provider-extension:codex-enabled-models'

// Migration universe only: these were the switches exposed by the old settings page.
const LEGACY_MODELS = [
  'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-reserve',
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'codex-auto-review',
]

function loadEnabledMap(): Record<string, string[]> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CODEX_ENABLED_MODELS_KEY) ?? '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string[]] =>
        Array.isArray(entry[1]) && entry[1].every(id => typeof id === 'string')))
    }
  } catch {}
  return {}
}

/** Undefined means no explicit selection; an empty set means hide every model. */
export function codexEnabledModels(accountId?: string, email?: string): Set<string> | undefined {
  const map = loadEnabledMap()
  const selected = (accountId ? map[accountId] : undefined) ?? (email ? map[email] : undefined)
  if (selected !== undefined) return new Set(selected)
  const legacy = loadAccountDisabledModels()
  const disabled = (accountId ? legacy[accountId] : undefined) ?? (email ? legacy[email] : undefined)
  // Do not reinterpret unrelated/non-Codex disabled ids as the old fixed list.
  if (!Array.isArray(disabled) || !disabled.some(id => LEGACY_MODELS.includes(id))) return undefined
  return new Set(LEGACY_MODELS.filter(id => !disabled.includes(id)))
}

export function saveCodexEnabledModels(accountId: string, email: string | undefined, models: Set<string>): void {
  const map = loadEnabledMap()
  map[accountId] = [...models]
  if (email) map[email] = [...models]
  window.localStorage.setItem(CODEX_ENABLED_MODELS_KEY, JSON.stringify(map))
  window.dispatchEvent(new Event(MODELS_VISIBILITY_EVENT))
}
