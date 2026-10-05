/** Provider Extension client plugin: owns the composer provider seat and hosts one module per provider. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ClientConnectionRpc, ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SlotCore, SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import { ProviderPanel } from './ProviderPanel.tsx'
import type { ProviderPanelInjected } from './ProviderPanel.tsx'
import { ProviderSettings } from './ProviderSettings.tsx'
import type { ProviderSettingsInjected } from './ProviderSettings.tsx'
import { cssText } from './ProviderPanel.module.css'
import { cssText as settingsCssText } from './ProviderSettings.module.css'
import { CodexAccountsController, isCodexProvider } from './providers/codex.ts'
import { AntigravityController, isAntigravityProvider } from './providers/antigravity.ts'
import { OpencodeController, isOpencodeProvider } from './providers/opencode.ts'
import { en, zh, type ProviderPanelKey } from './locales.ts'
import { accountRpcFallback } from './account-rpc.ts'
import { forceCatalogReload } from './catalog-refresh.ts'
import { assertSelectionSucceeded } from './selection.ts'
import { applyUsagePage } from './usage/index.tsx'

export { ProviderPanel } from './ProviderPanel.tsx'
export type { ProviderPanelInjected, ProviderPanelProps } from './ProviderPanel.tsx'
export { ProviderSettings } from './ProviderSettings.tsx'
export type { ProviderSettingsInjected, ProviderSettingsProps } from './ProviderSettings.tsx'
export { CodexAccountsController, decodeQuota, isCodexProvider, maskedEmail } from './providers/codex.ts'
export type { CodexAccountView, CodexAccountsState, CodexQuotaView, CodexUsageState } from './providers/codex.ts'
export { AntigravityController, decodeModels, decodeStatus, isAntigravityProvider } from './providers/antigravity.ts'
export type { AntigravityModelCatalog, AntigravityState, AntigravityStatus } from './providers/antigravity.ts'
export { OpencodeController, isOpencodeProvider } from './providers/opencode.ts'
export type { OpencodeModelView, OpencodeState, OpencodeUsageData, OpencodeUsageWindow } from './providers/opencode.ts'
export { accentFor, activeGroup, effortIndex, isCurrentModel, restingEffort, selectionForRow } from './selection.ts'
export type { ProviderPanelGroup, ProviderPanelModel } from './selection.ts'
export type { ProviderPanelKey } from './locales.ts'

interface SlotsService {
  readonly register: SlotCore['register']
  inject<K extends keyof SlotMap & string>(name: K, callback: () => () => void): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: SlotsService
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    providerExtension: ProviderPanelKey
  }
}

export const NS = 'providerExtension'
export const inject = ['slots', 'locale', 'modelDirectories', 'sessions', 'remote', 'remote.session']

/** Upper bound on one authoritative catalog round-trip before the panel reports a failure. */
const DIRECTORY_LOAD_TIMEOUT_MS = 20_000

/** The shared catalog's in-flight load can be dropped; `invalidate()` is public at runtime. */
interface InvalidatableCatalog {
  invalidate(): void
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(DIRECTORY_LOAD_TIMEOUT_MS / 1000)}s; reload to retry`)),
      DIRECTORY_LOAD_TIMEOUT_MS,
    )
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      cause => { clearTimeout(timer); reject(cause instanceof Error ? cause : new Error(String(cause))) },
    )
  })
}

/**
 * A connection reset can leave the shared catalog awaiting a Host RPC that
 * never settles, and every later `load()` reuses that wedged in-flight
 * promise — which would pin the panel's loading state forever while the
 * rendered list goes stale. Bound the wait, drop the wedged load, and retry
 * once before failing loud.
 */
async function loadDirectoryBounded(directory: { load(): Promise<unknown>; catalog?: InvalidatableCatalog }): Promise<unknown> {
  try {
    return await withTimeout(directory.load(), 'Model directory load')
  } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes('timed out') || directory.catalog === undefined) throw cause
    directory.catalog.invalidate()
    return withTimeout(directory.load(), 'Model directory load')
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-provider-extension: dictionaries')

  // The model seat must not disappear when the legacy connection service is absent.
  // Resolve its RPC lazily, falling back to the same authenticated /api routes.
  let connectionRpc: ClientConnectionRpc | undefined
  ctx.inject(['connection'], (scope: ClientContext) => {
    connectionRpc = (scope.get('connection') as unknown as ConnectionHandle).rpc
    return () => { connectionRpc = undefined }
  })
  const rpc = {
    call: (...args: unknown[]) => {
      const activeRpc = connectionRpc ?? accountRpcFallback
      return (activeRpc.call as (...params: unknown[]) => Promise<unknown>)(...args)
    },
  } as ClientConnectionRpc
  applyUsagePage(ctx, rpc)
  const codexAccounts = new CodexAccountsController(rpc)
  const antigravity = new AntigravityController(rpc)
  const opencode = new OpencodeController()
  opencode.setRpc(rpc)
  ctx.effect(() => () => { codexAccounts.dispose() }, 'dsh-provider-extension: Codex account controller')
  ctx.effect(() => () => { antigravity.dispose() }, 'dsh-provider-extension: Antigravity controller')
  ctx.effect(() => () => { opencode.dispose() }, 'dsh-provider-extension: OpenCode controller')
  ctx.effect(() => ctx.on('connection/reset', () => {
    codexAccounts.invalidate()
    antigravity.invalidate()
  }), 'dsh-provider-extension: account resets')
  ctx.effect(() => {
    void codexAccounts.load().catch(() => {})
    void antigravity.load().catch(() => {})
    return () => {}
  }, 'dsh-provider-extension: startup self-check')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-provider-extension'
    tag.textContent = `${cssText}\n${settingsCssText}`
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'dsh-provider-extension: styles')

  const readCodexQuota = async (id: string): Promise<void> => {
    await codexAccounts.readQuota(id)
    window.dispatchEvent(new Event('dsh-codex-subscription:refresh-quick-quota'))
  }

  // Settings surface: create providers, sign in, and inspect their state.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'provider-extension',
    order: 16,
    label: () => ctx.locale.bind(NS)('settingsNav'),
    locale: NS,
    inject: (): ProviderSettingsInjected => ({
      hooks: { accounts: codexAccounts.store, antigravity: antigravity.store },
      loadAccounts: async () => { await codexAccounts.load() },
      loadCodexModels: async () => {
        await codexAccounts.refreshModels()
        forceCatalogReload(ctx.modelDirectories)
        const result = await ctx.remote.session.modelCatalog()
        if (!result.ok) throw new Error(result.error.message)
        const failure = result.value.failures.find(entry => entry.id === 'openai-codex')
        if (failure) throw new Error(failure.message)
        return result.value.groups.find(group => group.id === 'openai-codex')?.models ?? []
      },
      readQuota: readCodexQuota,
      loginCodex: async () => { await codexAccounts.login() },
      selectCodexAccount: async (id) => { await codexAccounts.select(id) },
      renameCodexAccount: async (id, label) => { await codexAccounts.renameAccount(id, label) },
      removeCodexAccount: async (id) => { await codexAccounts.removeAccount(id) },
      resetCodexQuota: async (id) => { await codexAccounts.consumeResetCredit(id) },
      loadAntigravity: async () => { await antigravity.load() },
      refreshAntigravityModels: async () => {
        await antigravity.refreshModels()
        forceCatalogReload(ctx.modelDirectories)
      },
      loginAntigravity: async () => { await antigravity.login() },
      logoutAntigravity: async () => { await antigravity.logout() },
      selectAntigravityAccount: async (id) => { await antigravity.selectAccount(id) },
      updateAntigravityAccount: async (id, patch) => { await antigravity.updateAccount(id, patch) },
      renameAntigravityAccount: async (id, label) => { await antigravity.renameAccount(id, label) },
      removeAntigravityAccount: async (id) => { await antigravity.removeAccount(id) },
      readAntigravityQuota: async (id) => { await antigravity.readQuota(id) },
      useOpencode: (selector) => selector(opencode.store.getSnapshot()),
      saveOpencodeConfig: (apiKey, baseURL) => { opencode.saveConfig(apiKey, baseURL) },
      readOpencodeUsage: async () => { await opencode.readUsage() },
      refreshOpencodeModels: async () => { await opencode.refreshModels() },
    }),
  }, ProviderSettings))

  // The shipped selector currently occupies this single seat at priority -10.
  // A lower priority wins, so -20 deliberately replaces only its visual seat;
  // the official modelDirectories service and /model command remain mounted.
  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
    name: 'conversation.input.model',
    priority: -20,
    locale: NS,
    inject: (sessionId: string): ProviderPanelInjected => {
      const directory = ctx.modelDirectories.directoryFor(sessionId as SessionId)
      return {
        available: (ctx.sessions as unknown as { subagentAddress?: (id: SessionId) => unknown }).subagentAddress?.(sessionId as SessionId) === undefined,
        hooks: { directory: directory.store, accounts: codexAccounts.store, antigravity: antigravity.store },
        loadDirectory: async (force = false) => {
          if (force) {
            if (isCodexProvider(directory.store.getSnapshot().current?.provider)) await codexAccounts.refreshModels()
            forceCatalogReload(ctx.modelDirectories)
          }
          await loadDirectoryBounded(directory as typeof directory & { catalog?: InvalidatableCatalog })
        },
        loadAccounts: async () => { await codexAccounts.load() },
        loadAntigravity: async () => { await antigravity.load() },
        selectAccount: async (id) => {
          await codexAccounts.select(id)
          window.dispatchEvent(new Event('dsh-codex-subscription:refresh-quick-quota'))
          await codexAccounts.refreshModels()
          forceCatalogReload(ctx.modelDirectories)
          await loadDirectoryBounded(directory as typeof directory & { catalog?: InvalidatableCatalog })
        },
        selectAntigravityAccount: async (id) => {
          await antigravity.selectAccount(id)
          forceCatalogReload(ctx.modelDirectories)
          await loadDirectoryBounded(directory as typeof directory & { catalog?: InvalidatableCatalog })
        },
        readQuota: async (id) => {
          await codexAccounts.readQuota(id)
          window.dispatchEvent(new Event('dsh-codex-subscription:refresh-quick-quota'))
        },
        readAntigravityQuota: async (id) => {
          await antigravity.readQuota(id)
        },
        useOpencode: (selector) => selector(opencode.store.getSnapshot()),
        readOpencodeUsage: async () => { await opencode.readUsage() },
        select: async (selection) => { assertSelectionSucceeded(await directory.select(selection)) },
      }
    },
  }, ProviderPanel))
}
