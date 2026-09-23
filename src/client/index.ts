/** Provider Extension client plugin: owns the composer provider seat and hosts one module per provider. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
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
import { CodexAccountsController } from './providers/codex.ts'
import { AntigravityController, isAntigravityProvider } from './providers/antigravity.ts'
import { en, zh, type ProviderPanelKey } from './locales.ts'

export { ProviderPanel } from './ProviderPanel.tsx'
export type { ProviderPanelInjected, ProviderPanelProps } from './ProviderPanel.tsx'
export { ProviderSettings } from './ProviderSettings.tsx'
export type { ProviderSettingsInjected, ProviderSettingsProps } from './ProviderSettings.tsx'
export { CodexAccountsController, decodeQuota, isCodexProvider, maskedEmail } from './providers/codex.ts'
export type { CodexAccountView, CodexAccountsState, CodexQuotaView, CodexUsageState } from './providers/codex.ts'
export { AntigravityController, decodeModels, decodeStatus, isAntigravityProvider } from './providers/antigravity.ts'
export type { AntigravityModelCatalog, AntigravityState, AntigravityStatus } from './providers/antigravity.ts'
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
export const inject = ['slots', 'locale', 'connection', 'modelDirectories', 'sessions', 'remote', 'remote.session']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-provider-extension: dictionaries')

  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const codexAccounts = new CodexAccountsController(connection.rpc)
  const antigravity = new AntigravityController(connection.rpc)
  ctx.effect(() => () => { codexAccounts.dispose() }, 'dsh-provider-extension: Codex account controller')
  ctx.effect(() => () => { antigravity.dispose() }, 'dsh-provider-extension: Antigravity controller')
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
      readQuota: readCodexQuota,
      loginCodex: async () => { await codexAccounts.login() },
      removeCodexAccount: async (id) => { await codexAccounts.removeAccount(id) },
      loadAntigravity: async () => { await antigravity.load() },
      loginAntigravity: async () => { await antigravity.login() },
      logoutAntigravity: async () => { await antigravity.logout() },
      selectAntigravityAccount: async (id) => { await antigravity.selectAccount(id) },
      updateAntigravityAccount: async (id, patch) => { await antigravity.updateAccount(id, patch) },
      renameAntigravityAccount: async (id, label) => { await antigravity.renameAccount(id, label) },
      removeAntigravityAccount: async (id) => { await antigravity.removeAccount(id) },
      readAntigravityQuota: async (id) => { await antigravity.readQuota(id) },
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
        loadDirectory: async () => { await directory.load() },
        loadAccounts: async () => { await codexAccounts.load() },
        loadAntigravity: async () => { await antigravity.load() },
        selectAccount: async (id) => {
          await codexAccounts.select(id)
          window.dispatchEvent(new Event('dsh-codex-subscription:refresh-quick-quota'))
          await directory.load()
        },
        selectAntigravityAccount: async (id) => {
          await antigravity.selectAccount(id)
          await directory.load()
        },
        readQuota: async (id) => {
          await codexAccounts.readQuota(id)
          window.dispatchEvent(new Event('dsh-codex-subscription:refresh-quick-quota'))
        },
        readAntigravityQuota: async (id) => {
          await antigravity.readQuota(id)
        },
        select: async (selection) => { await directory.select(selection) },
      }
    },
  }, ProviderPanel))
}
