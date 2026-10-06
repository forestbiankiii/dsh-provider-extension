/** Subscription route through the user's unmodified Claude Code CLI. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { ClaudeCliAdapter } from './vendor/adapter.ts'
import { listCatalog } from './vendor/models.ts'
import { ClaudeChannelService, CLAUDE_PROVIDER, resolveClaudeLauncher } from './service.ts'
import { registerAccountRoutes } from '../antigravity/account-routes.ts'

export interface ClaudeConfig { claudeExecutable?: string; claudeStreamIdleTimeoutMs?: number; claudeUnsupportedFields?: 'error' | 'ignore' }
export function apply(ctx: Context, config: ClaudeConfig = {}): ClaudeChannelService {
  const command = config.claudeExecutable ?? 'claude'
  const lifetime = new AbortController()
  const launcher = () => resolveClaudeLauncher(command)
  const service = new ClaudeChannelService(launcher)
  const models = () => listCatalog(CLAUDE_PROVIDER).map(model => ({ id: model.id, name: model.name }))
  const adapter = new ClaudeCliAdapter({ executable: command, resolveExecutable: launcher, cwd: process.cwd(), streamIdleTimeoutMs: config.claudeStreamIdleTimeoutMs ?? 300000,
    unsupportedFields: config.claudeUnsupportedFields ?? 'error', extraArgs: [], signal: lifetime.signal })
  ctx.llm.registerAdapter([CLAUDE_PROVIDER], adapter)
  ctx.effect(() => () => { lifetime.abort(); service.dispose() }, 'provider-extension: Claude CLI lifecycle')
  ctx.inject(['connection'], scope => registerAccountRoutes(scope.connection, 'claude-subscription', ['status', 'models', 'login/start'], async (endpoint, payload, signal) => {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 0) return { ok: false, error: { code: 'bad-request', message: 'Expected an empty request.', details: {} } }
    try {
      signal.throwIfAborted()
      if (endpoint === 'status') return { ok: true, value: await service.status(signal) }
      if (endpoint === 'models') return { ok: true, value: models() }
      await service.login()
      return { ok: true, value: { started: true } }
    } catch {
      return { ok: false, error: { code: 'unavailable', message: 'Run claude auth login in your terminal, then refresh login status.', details: {} } }
    }
  }))
  // Login remains a user-only operation. The agent can inspect the same status/catalog as the page.
  const tool: ToolDefinition = {
    name: 'claude_channel', description: 'Read the official Claude Code CLI login status or advisory model aliases. Does not log in, access tokens, make model calls, or query subscription quotas.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'models'] } }, required: ['action'], additionalProperties: false },
    isConcurrencySafe: () => true,
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async args => {
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => key !== 'action')) throw new Error('Invalid Claude channel request')
      const action = (args as { action?: unknown }).action
      if (action === 'status') return service.status()
      if (action === 'models') return { source: 'cli-aliases', models: models() }
      throw new Error('Expected status or models')
    },
  }
  ctx.tools.register(tool)
  return service
}
