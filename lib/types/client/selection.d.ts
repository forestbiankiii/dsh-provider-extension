/** Pure selection policy for the combined model and effort seat. */
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
/** One catalog provider group of the current session directory. */
export type ProviderPanelGroup = ModelDirectoryState['groups'][number];
/** One catalog model inside a provider group. */
export type ProviderPanelModel = ProviderPanelGroup['models'][number];
/** Resolve the product family accent, falling back to the provider's row order. */
export declare function accentFor(modelId: string, index: number): string;
/** Find a declared effort; missing and unknown values have no slider position. */
export declare function effortIndex(model: ProviderPanelModel, effortId: string | undefined): number;
/** Only a valid declared default is a known resting effort; never infer Max. */
export declare function restingEffort(model: ProviderPanelModel): string | undefined;
/** Match the complete route, not a model id that another provider may also own. */
export declare function isCurrentModel(current: ModelDirectoryState['current'], provider: string, model: ProviderPanelModel): boolean;
/** Submit only installed ModelSelection fields. Metadata cannot enable context forwarding. */
export declare function selectionForRow(model: ProviderPanelModel, provider: string, effortId: string | undefined): ModelSelection;
/** Render the current provider, or the first loaded group as an explicit fallback. */
export declare function activeGroup(state: ModelDirectoryState): ProviderPanelGroup | undefined;
