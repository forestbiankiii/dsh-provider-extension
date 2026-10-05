/** Offline regression against the SDK actually shipped by DSH; no network or credentials.
 * Run: node --conditions=import scripts/verify-opencode-tools.mjs <DSH app directory>
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

assert(process.argv[2], 'Pass the DSH app directory to test its runtime SDK')
const runtimeRequire = createRequire(pathToFileURL(resolve(process.argv[2], 'package.json')))
const sdk = await import(pathToFileURL(runtimeRequire.resolve('@earendil-works/pi-ai')).href)
const { getBuiltinModels } = await import(pathToFileURL(runtimeRequire.resolve('@earendil-works/pi-ai/providers/all')).href)
const { openAICompletionsApi } = await import(pathToFileURL(runtimeRequire.resolve('@earendil-works/pi-ai/api/openai-completions.lazy')).href)

// Exercise the production conversion functions without adding public test exports
// or mounting the plugin. Resolve externals exactly against the installed host.
const source = await readFile(new URL('../src/opencode/index.js', import.meta.url), 'utf8')
const bundle = await build({
  stdin: { contents: `${source}\nexport { toPiContext, toStreamChunks };`, resolveDir: resolve(import.meta.dirname, '../src/opencode'), loader: 'js' },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
  plugins: [{ name: 'installed-host-dependencies', setup(api) {
    api.onResolve({ filter: /^(?:@deepseek-ai\/|@earendil-works\/)/ }, args => ({
      path: pathToFileURL(runtimeRequire.resolve(args.path)).href, external: true,
    }))
  } }],
})
const { toPiContext, toStreamChunks } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const tool = { name: 'grep', description: 'Search files', parameters: {
  type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern', 'path'],
} }
const user = { role: 'user', content: [{ type: 'text', text: 'Search for test.' }] }
const originalFetch = globalThis.fetch
let cases = 0
try {
  for (const id of ['deepseek-v4.1-flash', 'mimo-v2.6-pro']) {
    const model = getBuiltinModels('opencode-go').find(model => model.id === id)
    assert(model, `Runtime catalog must contain ${id}`)
    assert.equal(model.api, 'openai-completions')
    const provider = sdk.createProvider({ id: 'opencode-go', name: 'offline probe', baseUrl: model.baseUrl,
      auth: { apiKey: { name: 'probe', resolve: async () => ({ auth: {}, source: 'probe' }) } },
      models: [model], api: { 'openai-completions': openAICompletionsApi() },
    })
    for (const mode of ['structured', 'text', 'tools-only', 'no-tools']) {
      const options = { provider: 'opencode-go', model: id, messages: [user],
        ...(mode === 'tools-only' ? {} : { system: 'Diagnostic system prompt.' }),
        ...(mode === 'no-tools' ? {} : { tools: [tool] }),
      }
      const before = JSON.stringify(options)
      const context = toPiContext(options)
      assert.equal(JSON.stringify(options), before, 'Conversion must not mutate request history or schemas')
      let wire
      globalThis.fetch = async (_url, init) => {
        wire = JSON.parse(init.body)
        const structured = mode === 'structured' || mode === 'tools-only'
        const delta = structured
          ? { tool_calls: [{ index: 0, id: 'call_probe', type: 'function', function: { name: 'grep', arguments: '{"pattern":"test","path":"src"}' } }] }
          : { content: '<tool_call><function=grep></function></tool_call>' }
        const chunk = (delta, finish_reason) => ({ id: 'probe', object: 'chat.completion.chunk', created: 0, model: id,
          choices: [{ index: 0, delta, finish_reason }],
        })
        return new Response(`data: ${JSON.stringify(chunk(delta, null))}\n\ndata: ${JSON.stringify(chunk({}, structured ? 'tool_calls' : 'stop'))}\n\ndata: [DONE]\n\n`,
          { headers: { 'content-type': 'text/event-stream' } })
      }
      const events = provider.streamSimple(model, context, { apiKey: 'offline-dummy', maxRetries: 0 })
      const chunks = []
      for await (const chunk of toStreamChunks(events, model.contextWindow, undefined, model.id)) chunks.push(chunk)
      assert(wire, 'The SDK must construct a request')
      assert.equal(wire.tools?.length ?? 0, mode === 'no-tools' ? 0 : 1, 'Native tool definitions must reach the wire')
      if (mode !== 'no-tools') {
        assert.equal(wire.tools[0].function.name, 'grep')
        assert.deepEqual(wire.tools[0].function.parameters, tool.parameters)
      }
      const head = wire.messages.find(message => message.role === 'system')
      if (mode === 'tools-only') assert(!head, 'Tools-only context must not invent a system prompt')
      else assert.equal(head?.content, options.system)
      const calls = chunks.filter(chunk => chunk.type === 'block-end' && chunk.block.type === 'tool-call')
      const finish = chunks.find(chunk => chunk.type === 'finish')
      if (mode === 'structured' || mode === 'tools-only') {
        assert.equal(calls.length, 1)
        assert.equal(calls[0].block.name, 'grep')
        assert.deepEqual(JSON.parse(calls[0].block.arguments), { pattern: 'test', path: 'src' })
        assert.equal(finish?.reason.kind, 'tool-calls')
      } else {
        assert.equal(calls.length, 0, 'Plain-text XML must never become an executable tool call')
        assert.equal(finish?.reason.kind, 'stop')
      }
      cases++
      console.log(`PASS ${id}: ${mode}`)
    }
  }
} finally { globalThis.fetch = originalFetch }
console.log(`OpenCode runtime SDK regression passed (${cases} cases; zero network requests).`)
