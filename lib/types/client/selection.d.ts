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
/** Prefer a previously chosen effort for this model when still supported; otherwise fall back to resting effort. */
export declare function resolveModelEffort(model: ProviderPanelModel, rememberedEffort?: string): string | undefined;
/** Match the complete route, not a model id that another provider may also own. */
export declare function isCurrentModel(current: ModelDirectoryState['current'], provider: string, model: ProviderPanelModel): boolean;
/** Submit only installed ModelSelection fields. Metadata cannot enable context forwarding. */
export declare function selectionForRow(model: ProviderPanelModel, provider: string, effortId: string | undefined): ModelSelection;
/** Render the current provider, or the first loaded group as an explicit fallback. */
export declare function activeGroup(state: ModelDirectoryState): ProviderPanelGroup | undefined;
export declare const DISABLED_MODELS_STORAGE_KEY = "dsh-provider-extension:disabled-models";
export declare const ACCOUNT_DISABLED_MODELS_STORAGE_KEY = "dsh-provider-extension:account-disabled-models";
export declare const CUSTOM_ACCOUNT_LABELS_STORAGE_KEY = "dsh-provider-extension:custom-account-labels";
export declare const MODELS_VISIBILITY_EVENT = "dsh-provider-extension:models-visibility-changed";
export type AccountDisabledModelsMap = Record<string, string[]>;
export declare function loadCustomAccountLabels(): Record<string, string>;
export declare function saveCustomAccountLabel(id: string, email: string | undefined, label: string): void;
export declare function getCustomAccountLabel(id: string, email?: string): string | undefined;
export declare function loadAccountDisabledModels(): AccountDisabledModelsMap;
export declare function saveAccountDisabledModels(map: AccountDisabledModelsMap): void;
export declare function getDisabledModelsForAccount(accountId?: string, email?: string): Set<string>;
export declare function loadDisabledModels(): Set<string>;
export declare function saveDisabledModels(disabled: Set<string>): void;
