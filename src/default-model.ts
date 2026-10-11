/** Defaults belong to DSH, not browser preferences or a Session-local model change. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { CodexBalanceReader } from './codex/index.js'
import { z } from 'zod'
import { registerAccountRoutes } from './antigravity/account-routes.ts'

export interface DefaultModelSelection { provider: string; model: string; reasoningEffort?: string }
export interface DefaultModelView { selection: DefaultModelSelection; activeAccountId: string | null }
// The installed Host owns this service; older build-time DSH types predate its split from agent-loop.
interface DefaultModelOwner {
  currentSelection(): DefaultModelSelection
  saveSelection(selection: DefaultModelSelection): Promise<void>
}
const text = z.string().min(1).max(512)
const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get') }).strict(),
  z.object({ action: z.literal('set'), accountId: text, model: text }).strict(),
])
const rosterSchema = z.object({ accounts: z.array(z.object({ id: text, active: z.boolean() })).max(64) })
const modelsSchema = z.array(z.object({ id: text })).max(1024)

/** Shared by the authenticated page route and Agent tool. Never changes an account or Session. */
export function createDefaultModelOperation(ctx: Context, reader: () => CodexBalanceReader | undefined) {
  let saving = false
  return async (raw: unknown, signal: AbortSignal): Promise<DefaultModelView> => {
    const request = requestSchema.parse(raw)
    signal.throwIfAborted()
    const owner = ctx.get('agentDefaultModel') as DefaultModelOwner | undefined
    if (!owner || typeof owner.currentSelection !== 'function' || typeof owner.saveSelection !== 'function') throw Error('This DSH version does not expose native default-model settings')
    const codex = reader()
    const activeId = async (): Promise<string | null> => {
      if (!codex) return null
      const response = await codex.call('status', {}, signal)
      if (!response.ok) throw Error('Could not verify the active Codex account')
      return rosterSchema.parse(response.value).accounts.find(account => account.active)?.id ?? null
    }
    if (request.action === 'get') {
      const activeAccountId = await activeId()
      signal.throwIfAborted()
      return { selection: owner.currentSelection(), activeAccountId }
    }
    if (!ctx.get('configEditor')) throw Error('This DSH deployment cannot persist a default model')
    if (saving) throw Error('A default-model update is already in progress')
    saving = true
    try {
      if (!codex || await activeId() !== request.accountId) throw Error('Select this Codex account before setting its default model')
      const models = await codex.call('models', { id: request.accountId }, signal)
      if (!models.ok || !modelsSchema.parse(models.value).some(model => model.id === request.model)) throw Error('This model is not available in the selected account catalog')
      // Catalog reads may outlive an account switch: recheck, never use another account's result.
      if (await activeId() !== request.accountId) throw Error('The active Codex account changed; refresh and try again')
      signal.throwIfAborted()
      const current = owner.currentSelection()
      const selection = current.provider === 'openai-codex' && current.model === request.model
        ? current : { provider: 'openai-codex', model: request.model }
      // Await native persistence. A failed write is not reported as a successful selection.
      await owner.saveSelection(selection)
      const saved = owner.currentSelection()
      if (saved.provider !== selection.provider || saved.model !== selection.model) throw Error('DSH did not accept the default-model update')
      return { selection: saved, activeAccountId: request.accountId }
    } finally { saving = false }
  }
}

export function createDefaultModelTool(operation: ReturnType<typeof createDefaultModelOperation>): ToolDefinition & { deferLoading: boolean } {
  return {
    name: 'codex_default_model', deferLoading: true,
    description: 'Read or set the native DSH default for new conversations to a model from the active Codex account. Existing conversation selections and account selection are unchanged.',
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['get', 'set'] },
      accountId: { type: 'string', minLength: 1, maxLength: 512, description: 'Required for set. Use activeAccountId returned by get.' },
      model: { type: 'string', minLength: 1, maxLength: 512, description: 'Required for set. Exact model ID from that account’s catalog.' },
    }, required: ['action'], additionalProperties: false },
    isConcurrencySafe: args => typeof args === 'object' && args !== null && 'action' in args && args.action === 'get',
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (args, exec) => operation(args, exec.signal),
  }
}

export function applyDefaultModel(ctx: Context, reader: () => CodexBalanceReader | undefined): void {
  const operation = createDefaultModelOperation(ctx, reader)
  ctx.effect(() => ctx.tools.register(createDefaultModelTool(operation)), 'provider-extension: native default model tool')
  ctx.inject(['connection'], scope => scope.effect(() => registerAccountRoutes(scope.connection, 'provider-extension', ['default-model'], async (_endpoint, raw, signal) => {
    try { return { ok: true, value: await operation(raw, signal) } }
    catch (error) { return { ok: false, error: { code: 'default-model-rejected', message: error instanceof z.ZodError ? 'Invalid default-model request' : error instanceof Error ? error.message : 'Default-model update failed', details: {} } } }
  }), 'provider-extension: native default model route'))
}
