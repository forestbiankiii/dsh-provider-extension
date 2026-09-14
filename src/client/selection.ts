/** Pure selection policy for the combined model and effort seat. */

import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'

/** One catalog provider group of the current session directory. */
export type ModelPanelGroup = ModelDirectoryState['groups'][number]
/** One catalog model inside a provider group. */
export type ModelPanelModel = ModelPanelGroup['models'][number]

const FAMILY_ACCENTS: readonly (readonly [string, string])[] = [
  ['sol', '#E3A552'], ['terra', '#CBD3E0'], ['luna', '#8F7BF2'],
]
const PALETTE: readonly string[] = ['#E3A552', '#CBD3E0', '#8F7BF2', '#6FB3C8', '#D98C8C', '#7FC8A9']

/** Resolve the product family accent, falling back to the provider's row order. */
export function accentFor(modelId: string, index: number): string {
  const key = modelId.toLowerCase()
  for (const [family, accent] of FAMILY_ACCENTS) if (key.includes(family)) return accent
  return PALETTE[index % PALETTE.length] ?? PALETTE[0] ?? 'currentColor'
}

/** Find a declared effort; missing and unknown values have no slider position. */
export function effortIndex(model: ModelPanelModel, effortId: string | undefined): number {
  if (effortId === undefined) return -1
  return model.reasoning?.efforts.findIndex(effort => effort.id === effortId) ?? -1
}

/** Only a valid declared default is a known resting effort; never infer Max. */
export function restingEffort(model: ModelPanelModel): string | undefined {
  const effort = model.reasoning?.defaultEffort
  return effortIndex(model, effort) >= 0 ? effort : undefined
}

/** Match the complete route, not a model id that another provider may also own. */
export function isCurrentModel(
  current: ModelDirectoryState['current'], provider: string, model: ModelPanelModel,
): boolean {
  return current?.provider === provider && current.model === model.id
}

/** Submit only installed ModelSelection fields. Metadata cannot enable context forwarding. */
export function selectionForRow(
  model: ModelPanelModel,
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
export function activeGroup(state: ModelDirectoryState): ModelPanelGroup | undefined {
  return state.groups.find(group => group.id === state.current?.provider) ?? state.groups[0]
}
