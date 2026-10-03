/** Pure selection policy for the combined model and effort seat. */

import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'

/** One catalog provider group of the current session directory. */
export type ProviderPanelGroup = ModelDirectoryState['groups'][number]
/** One catalog model inside a provider group. */
export type ProviderPanelModel = ProviderPanelGroup['models'][number]

const FAMILY_ACCENTS: readonly (readonly [string, string])[] = [
  ['astra', 'color-mix(in srgb, var(--dsw-alias-label-primary) 72%, var(--dsw-alias-label-secondary))'],
  ['sol', 'var(--dsw-alias-state-error-primary)'],
  ['terra', 'var(--dsw-alias-state-warn-primary)'],
  ['luna', 'var(--dsw-alias-state-business-primary)'],
]
const PALETTE: readonly string[] = [
  'var(--dsw-alias-brand-primary)', 'var(--dsw-alias-label-secondary)',
  'var(--dsw-alias-state-success-primary)', 'var(--dsw-alias-state-warn-primary)',
]

/** Resolve the product family accent, falling back to the provider's row order. */
export function accentFor(modelId: string, index: number): string {
  const key = modelId.toLowerCase()
  for (const [family, accent] of FAMILY_ACCENTS) if (key.includes(family)) return accent
  return PALETTE[index % PALETTE.length] ?? PALETTE[0] ?? 'currentColor'
}

/** Old DSH resolves void; current DSH resolves a Result instead of throwing failures. */
export function assertSelectionSucceeded(result: unknown): void {
  if (typeof result !== 'object' || result === null || !('ok' in result) || result.ok !== false) return
  const error = 'error' in result ? result.error : undefined
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const code = 'code' in error ? `${String(error.code)}: ` : ''
    throw new Error(`${code}${String(error.message)}`)
  }
  throw new Error('Model selection was rejected')
}

export function sameSelection(a: ModelSelection | null | undefined, b: ModelSelection | null | undefined): boolean {
  return a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort
}

/** Find a declared effort; missing and unknown values have no slider position. */
export function effortIndex(model: ProviderPanelModel, effortId: string | undefined): number {
  if (effortId === undefined) return -1
  return model.reasoning?.efforts.findIndex(effort => effort.id === effortId) ?? -1
}

/** Only a valid declared default is a known resting effort; never infer Max. */
export function restingEffort(model: ProviderPanelModel): string | undefined {
  const effort = model.reasoning?.defaultEffort
  return effortIndex(model, effort) >= 0 ? effort : undefined
}

/** Prefer a previously chosen effort for this model when still supported; otherwise fall back to resting effort. */
export function resolveModelEffort(
  model: ProviderPanelModel,
  rememberedEffort?: string,
): string | undefined {
  if (rememberedEffort !== undefined && effortIndex(model, rememberedEffort) >= 0) {
    return rememberedEffort
  }
  return restingEffort(model)
}

/** Match the complete route, not a model id that another provider may also own. */
export function isCurrentModel(
  current: ModelDirectoryState['current'], provider: string, model: ProviderPanelModel,
): boolean {
  return current?.provider === provider && current.model === model.id
}

/** Submit only installed ModelSelection fields. Metadata cannot enable context forwarding. */
export function selectionForRow(
  model: ProviderPanelModel,
  provider: string,
  effortId: string | undefined,
): ModelSelection {
  const supportedEffort = effortIndex(model, effortId) >= 0 ? effortId : undefined
  return {
    provider,
    model: model.id,
    ...supportedEffort === undefined ? {} : { reasoningEffort: supportedEffort },
  }
}

/** Render the current provider, or the first loaded group as an explicit fallback. */
export function activeGroup(state: ModelDirectoryState): ProviderPanelGroup | undefined {
  return state.groups.find(group => group.id === state.current?.provider) ?? state.groups[0]
}

export const DISABLED_MODELS_STORAGE_KEY = 'dsh-provider-extension:disabled-models'
export const ACCOUNT_DISABLED_MODELS_STORAGE_KEY = 'dsh-provider-extension:account-disabled-models'
export const CUSTOM_ACCOUNT_LABELS_STORAGE_KEY = 'dsh-provider-extension:custom-account-labels'
export const MODELS_VISIBILITY_EVENT = 'dsh-provider-extension:models-visibility-changed'

export type AccountDisabledModelsMap = Record<string, string[]>

export function loadCustomAccountLabels(): Record<string, string> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(CUSTOM_ACCOUNT_LABELS_STORAGE_KEY)
      if (raw) return JSON.parse(raw) as Record<string, string>
    }
  } catch {}
  return {}
}

export function saveCustomAccountLabel(id: string, email: string | undefined, label: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const map = loadCustomAccountLabels()
      map[id] = label
      if (email) map[email] = label
      window.localStorage.setItem(CUSTOM_ACCOUNT_LABELS_STORAGE_KEY, JSON.stringify(map))
      window.dispatchEvent(new Event(MODELS_VISIBILITY_EVENT))
    }
  } catch {}
}

export function getCustomAccountLabel(id: string, email?: string): string | undefined {
  const map = loadCustomAccountLabels()
  return map[id] ?? (email ? map[email] : undefined)
}

export function loadAccountDisabledModels(): AccountDisabledModelsMap {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(ACCOUNT_DISABLED_MODELS_STORAGE_KEY)
      if (raw) return JSON.parse(raw) as AccountDisabledModelsMap
    }
  } catch {}
  return {}
}

export function saveAccountDisabledModels(map: AccountDisabledModelsMap): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACCOUNT_DISABLED_MODELS_STORAGE_KEY, JSON.stringify(map))
      window.dispatchEvent(new Event(MODELS_VISIBILITY_EVENT))
    }
  } catch {}
}

export function getDisabledModelsForAccount(accountId?: string, email?: string): Set<string> {
  const map = loadAccountDisabledModels()
  if (accountId && Array.isArray(map[accountId])) {
    return new Set(map[accountId])
  }
  if (email && Array.isArray(map[email])) {
    return new Set(map[email])
  }
  return loadDisabledModels()
}

export function loadDisabledModels(): Set<string> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(DISABLED_MODELS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return new Set(parsed)
      }
    }
  } catch {}
  return new Set()
}

export function saveDisabledModels(disabled: Set<string>): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(DISABLED_MODELS_STORAGE_KEY, JSON.stringify([...disabled]))
      window.dispatchEvent(new Event(MODELS_VISIBILITY_EVENT))
    }
  } catch {}
}
