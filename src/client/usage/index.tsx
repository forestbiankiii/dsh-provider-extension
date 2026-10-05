/** Register one additive global panel; no Session binding or extra application shell. */
import type { Context } from '@deepseek-ai/cordis'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { UsagePage } from './UsagePage.tsx'
import { en, zh, NS } from './locales.ts'
import { cssText } from './UsagePage.module.css'

// These root-scoped contracts are supplied by the live shell, not a runtime import.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    main: { kind: 'keyed'; scope: 'root' }
    'sidebar.panellist': { kind: 'list'; scope: 'root'; owner: { size: number; active: boolean } }
  }
}

function UsageIcon({ size, active }: { size: number; active: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)' }}><path d="M4 19V5M4 19h16M8 15v-4m5 4V7m5 8v-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
}

export function applyUsagePage(ctx: Context, rpc: ClientConnectionRpc): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-provider-extension: usage dictionaries')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: 'provider-usage', locale: NS,
    inject: () => ({ rpc, language: () => ctx.locale.getSnapshot().active }),
  }, props => <><style>{cssText}</style><UsagePage {...props} /></>))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: 'provider-usage', order: 10,
    label: () => ctx.locale.bind(NS)('title'),
  }, UsageIcon))
}
