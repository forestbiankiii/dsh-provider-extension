export declare const CODEX_ENABLED_MODELS_KEY = "dsh-provider-extension:codex-enabled-models";
/** Undefined means no explicit selection; an empty set means hide every model. */
export declare function codexEnabledModels(accountId?: string, email?: string): Set<string> | undefined;
export declare function saveCodexEnabledModels(accountId: string, email: string | undefined, models: Set<string>): void;
