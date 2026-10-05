/** Provider-owned balances/quotas are account-wide, independent of usage-log filters. */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageProviderBalance } from '../../usage/types.ts'
import type { UsageKey } from './locales.ts'
import css from './UsagePage.module.css'

export function ProviderBalances({ providers, t, locale }: { providers: UsageProviderBalance[]; t: Translate<UsageKey>; locale: string }) {
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
  const status: Record<Exclude<UsageProviderBalance['status'], 'ready'>, UsageKey> = {
    'signed-out': 'quotaSignedOut', failed: 'quotaFailed', unsupported: 'quotaUnsupported', inactive: 'quotaInactive', unavailable: 'quotaUnavailable',
  }
  return <>{providers.map(provider => <section className={css.accountBalanceCard} data-provider={provider.provider} key={`${provider.provider}/${provider.accountId ?? ''}`} aria-label={`${provider.name} ${provider.label}`}>
    <div className={css.accountHeading}><h3>{provider.name}</h3>{provider.plan && <span className={css.accountBadge}>{provider.plan}</span>}{provider.active && <span className={css.accountBadge}>{t('activeAccount')}</span>}</div>
    {provider.accountId && <p className={css.accountLabel}>{provider.label}</p>}
    <small>{t('checked', { time: new Date(provider.checkedAt).toLocaleString(locale) })}</small>
    {provider.subscriptionUntil !== null && <p>{t('subscriptionUntil', { time: new Date(provider.subscriptionUntil).toLocaleString(locale) })}</p>}
    {provider.status !== 'ready' ? <p>{t(status[provider.status])}</p> : <>
      {provider.windows.map(window => {
        const group = window.group ? `${t(window.group === 'gemini' ? 'quotaGemini' : 'quotaNonGemini')} · ` : ''
        const name = `${group}${t(({ '5h': 'quota5h', weekly: 'quotaWeekly', rolling: 'quotaRolling', monthly: 'quotaMonthly' } as const)[window.window])}`
        return <div className={css.quotaWindow} key={`${window.group ?? ''}/${window.window}`}>
          <div className={css.quotaHeading}><span>{name}</span><strong>{t(window.kind === 'remaining' ? 'quotaRemaining' : 'quotaReported', { percent: number(window.percent) })}</strong></div>
          <progress max={100} value={Math.min(100, window.percent)} aria-label={`${provider.name} ${provider.label}: ${name}`} />
          {window.resetsAt !== null && <small>{t('quotaResets', { time: new Date(window.resetsAt).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) })}</small>}
          {window.limited && <small>{t('quotaLimited')}</small>}
        </div>
      })}
      {(provider.credits !== null || provider.unlimitedCredits) && <p>{t('quotaCredits')}: <strong>{provider.unlimitedCredits ? t('quotaUnlimited') : provider.credits}</strong><small className={css.quotaNote}>{t('quotaCreditsHint')}</small></p>}
      {provider.resetCredits !== null && <p>{t('quotaResetCredits')}: <strong>{number(provider.resetCredits)}</strong></p>}
    </>}
  </section>)}</>
}
