/** Model-panel copy; both locales describe the actual installed capability. */
export declare const en: {
    readonly title: "Model and reasoning effort";
    readonly trigger: "Select model";
    readonly effort: "Reasoning effort";
    readonly providerTitle: "Select provider";
    readonly providerTrigger: "Provider";
    readonly providerEmpty: "No provider is available.";
    readonly contextWindow: "Context window";
    readonly reload: "Reload";
    readonly loading: "Loading models…";
    readonly empty: "No model is available.";
    readonly noEffort: "This model offers no reasoning effort.";
    readonly noEffortShort: "No effort control";
    readonly defaultEffort: "Provider default";
    readonly unknownEffort: "Unknown: {effort}";
    readonly selectModel: "Select {model}";
    readonly missing: "No catalog entry for {provider} / {model}.";
    readonly adjustEffort: "Adjust the reasoning effort of {model}";
    readonly selectFailed: "Model selection failed: {message}";
    readonly loadFailed: "Model loading failed: {message}";
    readonly providerFailed: "{provider}: {message}";
    readonly contextUnsupported: "Context-window selection is not supported by this runtime.";
};
export type ModelPanelKey = keyof typeof en;
export declare const zh: {
    [Key in ModelPanelKey]: string;
};
