/** No-network smoke check against an explicitly selected installed DSH runtime. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const root = process.argv[2]
if (!root) throw Error('Pass the installed DSH application directory as the first argument')
const { PiAiAdapter } = await import(pathToFileURL(join(root, 'node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js')).href)
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = name => source.split(`//#region src/${name}.js\n`)[1].split('//#endregion')[0]
let current = { mode: 'standard', models: {} }
const captured = []
const model = { id: 'context-smoke', name: 'Context smoke', api: 'openai-codex-responses', provider: 'openai-codex', input: ['text'], reasoning: false, contextWindow: 272000, maxContextWindow: 1000000, maxTokens: 8192, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
const fake = { id: 'openai-codex', name: 'No-network context check', auth: {}, getModels: () => [model],
  async *streamSimple(selected) {
    captured.push(selected.contextWindow)
    yield { type: 'done', reason: 'stop', message: { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [{ type: 'text', text: 'mock' }], stopReason: 'stop', timestamp: Date.now(), usage: { input: 1, output: 1, totalTokens: 2, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } }
  }
}
const { createProvider, snapshotProfile } = new Function('createOpenAICodexProvider', 'normalizeAbortDrops', ['image-features', 'capability-settings', 'settings-contract', 'context-length', 'pi-ai-runtime'].map(region).join('\n') + '\nreturn { createProvider: openaiCodexSubscriptionProvider, snapshotProfile: snapshotCodexProfile }')(() => fake, value => value)
const provider = createProvider({ resolveContextMode: () => current.mode, resolveCustomContextWindow: key => current.models[key] })
const profile = { provider: 'openai-codex', displayName: 'No-network context check', piProvider: provider, configuredMaxTokens: new Map(), modelErrors: new Map(), streamIdleTimeoutMs: 1000, maxRequestImageBytes: 20000000, requestImagePixelBudget: 4194304, requestImageMaxBytes: 1048576, cacheRetention: 'short', transport: 'sse' }
let key, snapshot
const adapter = new PiAiAdapter({ profiles: () => {
  const next = JSON.stringify(current)
  if (next !== key) { key = next; snapshot = new Map([['openai-codex', snapshotProfile(profile)]]) }
  return snapshot
}, resolveApiKey: async () => 'mock-no-network' })
const config = { provider: 'openai-codex', model: model.id }
const old = await adapter.prepareCall(config.provider, config.model)
assert.equal(old.model.context.contextWindow, 272000)
current = { mode: 'extended', models: {} }
assert.equal((await adapter.resolveModel(config.provider, config.model)).context.contextWindow, 1000000)
current = { mode: 'custom', models: { [model.id]: 600000 } }
const custom = await adapter.prepareCall(config.provider, config.model)
assert.equal(custom.model.context.contextWindow, 600000)
const request = { ...config, messages: [{ role: 'user', content: [{ type: 'text', text: 'No network' }] }] }
for await (const _chunk of old.stream(request)) {}
for await (const _chunk of custom.stream(request)) {}
assert.deepEqual(captured, [272000, 600000], 'already-prepared calls retain their original context snapshot')
console.log('Installed PiAiAdapter context metadata, custom stream selection and pinned prior calls passed; no network or user settings accessed.')
