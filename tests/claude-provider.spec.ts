import { describe, expect, it, vi, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ClaudeChannelService, projectClaudeStatus, resolveClaudeLauncher } from '../src/claude/service.ts'
import { ClaudeCliAdapter, assertExtraArgsSafe } from '../src/claude/vendor/adapter.ts'
import { runCli } from '../src/claude/vendor/cli.ts'
import { buildToolBridgeSpec, harnessToolName } from '../src/claude/vendor/tools.ts'
import { translate } from '../src/claude/vendor/translate.ts'
import { readProviderBalances } from '../src/usage/provider-balances.ts'
import { renderConversation } from '../src/claude/vendor/render.ts'
const fixture = fileURLToPath(new URL('./fixtures/claude-cli.mjs', import.meta.url))
const message = { role: 'user', content: [{ type: 'text', text: 'synthetic prompt' }] } as any
const options = { provider: 'anthropic-claude-cli', model: 'sonnet', messages: [message] } as any
const collect = async (stream: AsyncIterable<unknown>) => { const result: any[] = []; for await (const row of stream) result.push(row); return result }
afterEach(() => vi.unstubAllEnvs())

describe('Claude official CLI provider', () => {
  it('preserves modern DSH tool correlation and system/developer roles alongside legacy tool blocks', () => {
    const value = renderConversation([
      { role: 'system', content: [{ type: 'text', text: 'system instruction' }] },
      { role: 'developer', content: [{ type: 'text', text: 'developer instruction' }] },
      { role: 'assistant', content: [{ type: 'tool-call', id: 'call-a', name: 'read', arguments: '{}' }] },
      { role: 'tool', toolCallId: 'call-a', isError: true, content: [{ type: 'text', text: 'synthetic error' }] },
      { role: 'user', content: [{ type: 'tool-result', toolCallId: 'legacy', isError: false, content: [{ type: 'text', text: 'legacy result' }] }] },
    ] as any)
    expect(value).toContain('<system>\nsystem instruction')
    expect(value).toContain('<developer>\ndeveloper instruction')
    expect(value).toContain('<tool-result id="call-a" error="true">\nsynthetic error')
    expect(value).toContain('<tool-result id="legacy">\nlegacy result')
  })
  it('preserves a configured native executable extension on Windows PATH', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dpe-launcher-test-'))
    try {
      const executable = join(directory, 'claude.exe')
      await writeFile(executable, 'synthetic placeholder; never executed')
      expect(resolveClaudeLauncher('claude.exe', 'win32', directory).executable).toBe(executable)
      expect(resolveClaudeLauncher('claude', 'win32', directory).executable).toBe(executable)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('projects only bounded public status without credentials or fabricated plans', () => {
    const result = projectClaudeStatus({ loggedIn: true, authMethod: 'claude.ai', email: 'synthetic@example.com', subscriptionType: 'max', accessToken: 'SECRET', refreshToken: 'SECRET' }, 123)
    expect(result).toMatchObject({ status: 'ready', label: 'sy***@example.com', plan: 'MAX', checkedAt: 123 })
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(projectClaudeStatus({ loggedIn: true, subscriptionType: 'unknown', authMethod: 'unknown' }).plan).toBeNull()
    expect(projectClaudeStatus({ loggedIn: false, email: 'private@example.com' }).label).toBeNull()
    expect(() => projectClaudeStatus({})).toThrow('invalid-response')
  })
  it('isolates missing, malformed and cancelled metadata reads', async () => {
    const missing = new ClaudeChannelService(() => { throw new Error('cli-missing') })
    expect(await missing.status()).toMatchObject({ status: 'missing', errorCode: 'cli-missing' })
    const bad = new ClaudeChannelService(() => ({ executable: 'test', args: [] }), async () => 'bad')
    expect(await bad.status()).toMatchObject({ status: 'failed', errorCode: 'invalid-response' })
    bad.dispose()
    await expect(bad.status()).rejects.toThrow()
    const good = new ClaudeChannelService(() => ({ executable: 'test', args: [] }), async () => '{"loggedIn":false}')
    expect(await good.status()).toMatchObject({ status: 'signed-out' })
  })
  it('never presents unreported quota as 100% or a cash balance', async () => {
    const rows = await readProviderBalances([{ id: 'anthropic-claude-cli', name: 'Anthropic Claude' }, { id: 'anthropic', name: 'Custom API' }],
      { claude: { status: async () => projectClaudeStatus({ loggedIn: true, email: 'a@example.com', subscriptionType: 'pro' }) } }, new AbortController().signal)
    expect(rows[0]).toMatchObject({ status: 'unavailable', active: true, plan: 'PRO', windows: [], credits: null, subscriptionUntil: null })
    expect(rows[1]).toMatchObject({ status: 'unsupported' })
  })
  it('rejects extra flags that would restore native agent tools', () => {
    for (const flag of ['--tools=default', '--permission-mode', '--system-prompt', '--continue']) expect(() => assertExtraArgsSafe([flag])).toThrow()
  })
  it('bridges declared tools only and preserves collision-safe names', () => {
    const spec = buildToolBridgeSpec([{ name: 'read.test', description: 'test', parameters: {} }, { name: 'read_test', description: 'test', parameters: {} }])
    expect(spec.tools.map(tool => tool.name)).toEqual(['read_test', 'read_test_2'])
    expect(harnessToolName('mcp__dsh__read_test', spec.harnessNames)).toBe('read.test')
    expect(harnessToolName('mcp__dsh__unknown', spec.harnessNames)).toBeUndefined()
    expect(harnessToolName('Bash', spec.harnessNames)).toBeUndefined()
  })
  it.each([false, true])('streams %s tool mode through a synthetic CLI and retains full token accounting', async tool => {
    const directory = await mkdtemp(join(tmpdir(), 'dpe-claude-test-'))
    try {
      const argv = join(directory, 'argv.json')
      vi.stubEnv('DPE_TEST_ARGV', argv)
      const systemCopy = join(directory, 'system-copy.txt')
      vi.stubEnv('DPE_TEST_SYSTEM', systemCopy)
      const system = 'synthetic system prompt '.repeat(3000)
      const adapter = new ClaudeCliAdapter({ executable: process.execPath, resolveExecutable: () => ({ executable: process.execPath, args: [fixture] }), cwd: directory, streamIdleTimeoutMs: 1000, unsupportedFields: 'error', extraArgs: [] })
      expect(adapter.providerInfo(options.provider).name).toBe('Anthropic Claude')
      expect((await adapter.listModels(options.provider)).map(model => model.id)).toEqual(['sonnet', 'opus', 'haiku'])
      const chunks = await collect(adapter.stream({ ...options, system, tools: tool ? [{ name: 'read.test', description: 'test', parameters: { type: 'object' } }] : [] }))
      expect(chunks.find(chunk => chunk.type === 'usage').usage).toMatchObject({ inputTokens: 17, outputTokens: 3 })
      expect(chunks.at(-1).reason.kind).toBe(tool ? 'tool-calls' : 'stop')
      if (tool) expect(chunks.find(chunk => chunk.type === 'block-end').block).toMatchObject({ type: 'tool-call', name: 'read.test', arguments: '{"path":"test.txt"}' })
      else expect(chunks.find(chunk => chunk.type === 'text-delta').text).toBe('synthetic reply')
      const args = JSON.parse(await readFile(argv, 'utf8'))
      expect(args[args.indexOf('--tools') + 1]).toBe('')
      expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk')
      expect(args).toContain('--no-session-persistence')
      expect(args).not.toContain(system)
      expect(args).toContain('--system-prompt-file')
      expect(await readFile(systemCopy, 'utf8')).toBe(system)
      await expect(readFile(args[args.indexOf('--system-prompt-file') + 1], 'utf8')).rejects.toThrow()
      await expect(collect(adapter.stream({ ...options, temperature: 0.3 }))).rejects.toThrow('temperature')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('fails partial streams instead of turning truncated output into success', async () => {
    async function* lines() { yield JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text' } } }); yield JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } } }) }
    const chunks = await collect(translate(lines(), { harnessNames: {}, now: Date.now }))
    expect(chunks.at(-1).reason.kind).toBe('error')
  })
  it('propagates caller cancellation and output idle timeout to a child process', async () => {
    const controller = new AbortController()
    const start = () => ({ executable: process.execPath, args: [fixture, '--idle'], stdinPayload: '', cwd: process.cwd(), env: process.env })
    const cancelled = runCli(start(), { signal: controller.signal, idleTimeoutMs: 2000 })
    try { const pending = cancelled.lines.next(); controller.abort(); await expect(pending).rejects.toThrow() } finally { await cancelled.close() }
    const idle = runCli(start(), { idleTimeoutMs: 50 })
    try { await expect(idle.lines.next()).rejects.toThrow('no output') } finally { await idle.close() }
  })
})
