/** Standalone DSH model and reasoning-effort panel client plugin. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SlotCore, SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import { ModelPanel } from './ModelPanel.tsx'
import type { ModelPanelInjected } from './ModelPanel.tsx'
import { cssText } from './ModelPanel.module.css'
import { en, zh, type ModelPanelKey } from './locales.ts'

export { ModelPanel } from './ModelPanel.tsx'
export type { ModelPanelInjected, ModelPanelProps } from './ModelPanel.tsx'
export { accentFor, activeGroup, effortIndex, isCurrentModel, restingEffort, selectionForRow } from './selection.ts'
export type { ModelPanelGroup, ModelPanelModel } from './selection.ts'
export type { ModelPanelKey } from './locales.ts'

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
    modelPanel: ModelPanelKey
  }
}

export const NS = 'modelPanel'
export const inject = ['slots', 'locale', 'modelDirectories', 'sessions', 'remote', 'remote.session']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-model-panel: dictionaries')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-model-panel'
    tag.textContent = cssText
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'dsh-model-panel: styles')

  // The shipped selector currently occupies this single seat at priority -10.
  // A lower priority wins, so -20 deliberately replaces only its visual seat;
  // the official modelDirectories service and /model command remain mounted.
  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
    name: 'conversation.input.model',
    priority: -20,
    locale: NS,
    inject: (sessionId: string): ModelPanelInjected => {
      const directory = ctx.modelDirectories.directoryFor(sessionId as SessionId)
      return {
        available: ctx.sessions.subagentAddress(sessionId as SessionId) === undefined,
        hooks: { directory: directory.store },
        loadDirectory: async () => { await directory.load() },
        select: async (selection) => { await directory.select(selection) },
      }
    },
  }, ModelPanel))
}
