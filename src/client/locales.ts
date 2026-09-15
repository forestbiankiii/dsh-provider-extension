/** Model-panel copy; both locales describe the actual installed capability. */
export const en = {
  title: 'Model and reasoning effort', trigger: 'Select model', effort: 'Reasoning effort',
  providerTitle: 'Select provider', providerTrigger: 'Provider', providerEmpty: 'No provider is available.',
  contextWindow: 'Context window', reload: 'Reload', loading: 'Loading models…',
  empty: 'No model is available.', noEffort: 'This model offers no reasoning effort.',
  noEffortShort: 'No effort control', defaultEffort: 'Provider default',
  unknownEffort: 'Unknown: {effort}', selectModel: 'Select {model}',
  missing: 'No catalog entry for {provider} / {model}.',
  adjustEffort: 'Adjust the reasoning effort of {model}',
  selectFailed: 'Model selection failed: {message}', loadFailed: 'Model loading failed: {message}',
  providerFailed: '{provider}: {message}',
  contextUnsupported: 'Context-window selection is not supported by this runtime.',
} as const
export type ModelPanelKey = keyof typeof en
export const zh: { [Key in ModelPanelKey]: string } = {
  title: '模型与推理等级', trigger: '选择模型', effort: '推理等级',
  providerTitle: '选择提供方', providerTrigger: '提供方', providerEmpty: '没有可用的提供方。',
  contextWindow: '上下文窗口', reload: '重新加载', loading: '正在加载模型…',
  empty: '没有可用的模型。', noEffort: '当前模型未提供推理等级。',
  noEffortShort: '无推理档位', defaultEffort: '提供方默认',
  unknownEffort: '未知：{effort}', selectModel: '选择 {model}',
  missing: '未在目录中找到 {provider} / {model}。',
  adjustEffort: '调整 {model} 的推理等级',
  selectFailed: '模型选择失败：{message}', loadFailed: '模型加载失败：{message}',
  providerFailed: '{provider}：{message}',
  contextUnsupported: '此运行时不支持选择上下文窗口。',
}
