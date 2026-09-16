/** Settings page that creates and drives the plugin's provider integrations. */

import { useState, type ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { maskedEmail, type CodexAccountsState } from './providers/codex.ts'
import {
  ANTIGRAVITY_PACKAGE, ANTIGRAVITY_PACKAGE_RANGE, type AntigravityState,
} from './providers/antigravity.ts'
import css from './ProviderSettings.module.css'

/** Per-surface actions and stores injected by the client plugin. */
export interface ProviderSettingsInjected {
  hooks: {
    /** Secret-free ChatGPT account roster from the Codex integration. */
    accounts: SnapshotStore<CodexAccountsState>
    /** Antigravity companion status and advisory model catalog. */
    antigravity: SnapshotStore<AntigravityState>
  }
  loadAccounts: () => Promise<void>
  readQuota: (id: string) => Promise<void>
  loadAntigravity: () => Promise<void>
  loginAntigravity: () => Promise<void>
  logoutAntigravity: () => Promise<void>
}

/** Settings-section props: the shell lends `close`, the plugin injects the rest. */
export type ProviderSettingsProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'providerExtension'>
  & InjectFace<ProviderSettingsInjected>

type PhaseKey = 'antigravityIdle' | 'antigravityPending' | 'antigravitySuccess'
  | 'antigravityCancelled' | 'antigravityExpired' | 'antigravityPortConflict' | 'antigravityFailed'

/** Copy shown for one Antigravity login phase. */
function phaseKey(phase: string | undefined): PhaseKey {
  switch (phase) {
    case 'pending': return 'antigravityPending'
    case 'success': return 'antigravitySuccess'
    case 'cancelled': return 'antigravityCancelled'
    case 'expired': return 'antigravityExpired'
    case 'port-conflict': return 'antigravityPortConflict'
    case 'failed': return 'antigravityFailed'
    default: return 'antigravityIdle'
  }
}

/** Render provider creation plus the status of every supported integration. */
export function ProviderSettings({
  useAccounts, useAntigravity, loadAccounts, readQuota, loadAntigravity, loginAntigravity, logoutAntigravity, t,
}: ProviderSettingsProps): ReactNode {
  const accounts = useAccounts(snapshot => snapshot)
  const antigravity = useAntigravity(snapshot => snapshot)
  const [creating, setCreating] = useState(false)
  const login = antigravity.view?.login
  const installed = antigravity.status === 'ready'
  const installCommand = `dsh plugin --profile desktop add ${ANTIGRAVITY_PACKAGE}@${ANTIGRAVITY_PACKAGE_RANGE}`

  return (
    <section className={css.page} data-testid="provider-settings">
      <header className={css.head}>
        <div>
          <h2 className={css.title}>{t('settingsNav')}</h2>
          <p className={css.intro}>{t('providersIntro')}</p>
        </div>
        <div className={css.headActions}>
          <button
            type="button"
            className={`${css.action} ${css.primary}`}
            aria-expanded={creating}
            onClick={() => { setCreating(value => !value) }}
          >{creating ? t('providerCloseCatalog') : t('createProvider')}</button>
          <button type="button" className={css.action} disabled={antigravity.busy === true} onClick={() => { void loadAntigravity() }}>
            {antigravity.status === 'checking' ? t('providerChecking') : t('providerRefresh')}
          </button>
        </div>
      </header>

      {creating ? (
        <div className={css.catalog} data-testid="provider-catalog">
          <div className={css.catalogRow}>
            <div className={css.catalogCopy}>
              <span className={css.cardTitle}>{t('providerAntigravity')}</span>
              <span className={css.note}>{t('antigravityCatalogHint')}</span>
            </div>
            {installed ? (
              <button
                type="button"
                className={`${css.action} ${css.primary}`}
                disabled={antigravity.busy === true}
                onClick={() => { void loginAntigravity().catch(() => {}) }}
              >{t('providerConnect')}</button>
            ) : null}
          </div>
          {installed ? null : <code className={css.command}>{installCommand}</code>}
          <div className={css.catalogRow}>
            <div className={css.catalogCopy}>
              <span className={css.cardTitle}>{t('providerCodex')}</span>
              <span className={css.note}>{t('codexCatalogHint')}</span>
            </div>
          </div>
        </div>
      ) : null}

      <article className={css.card}>
        <div className={css.cardHead}>
          <span className={css.cardTitle}>{t('providerAntigravity')}</span>
          <span className={css.badge} data-state={antigravity.status}>
            {antigravity.status === 'absent' ? t('providerNotInstalled')
              : installed ? t('providerInstalled')
                : antigravity.status === 'error' ? t('providerError') : t('providerChecking')}
          </span>
        </div>

        {antigravity.status === 'absent' ? (
          <>
            <p className={css.note}>{t('antigravityInstallHint')}</p>
            <code className={css.command}>{installCommand}</code>
          </>
        ) : (
          <>
            <dl className={css.facts}>
              <div>
                <dt>{t('antigravityLoginState')}</dt>
                <dd>{t(phaseKey(login?.phase))}{login?.maskedEmail === undefined ? '' : ` · ${login.maskedEmail}`}</dd>
              </div>
              <div>
                <dt>{t('antigravityProject')}</dt>
                <dd>{login?.projectAvailable === true ? t('antigravityProjectReady') : t('antigravityProjectUnavailable')}</dd>
              </div>
              <div>
                <dt>{t('antigravityRiskState')}</dt>
                <dd>{antigravity.view?.riskAcknowledged === true ? t('antigravityRiskAccepted') : t('antigravityRiskPending')}</dd>
              </div>
            </dl>

            <p className={css.note}>{t('antigravityRisk')}</p>

            <div className={css.actions}>
              <button
                type="button"
                className={`${css.action} ${css.primary}`}
                disabled={antigravity.busy === true || login?.phase === 'pending'}
                onClick={() => { void loginAntigravity().catch(() => {}) }}
              >{antigravity.busy === true ? t('providerWorking') : t('antigravitySignIn')}</button>
              {typeof login?.authorizationUrl === 'string' ? (
                <a className={css.action} href={login.authorizationUrl} target="_blank" rel="noreferrer">
                  {t('antigravityOpenLink')}
                </a>
              ) : null}
              <button
                type="button"
                className={css.action}
                disabled={antigravity.busy === true || login?.configured !== true}
                onClick={() => { void logoutAntigravity().catch(() => {}) }}
              >{t('antigravitySignOut')}</button>
            </div>

            {antigravity.error === undefined ? null : <p className={css.error} role="alert">{antigravity.error}</p>}

            <div className={css.block}>
              <span className={css.blockTitle}>{t('antigravityModels')}</span>
              {antigravity.models === undefined || antigravity.models.models.length === 0
                ? <p className={css.note}>{t('antigravityNoModels')}</p>
                : <ul className={css.models}>
                  {antigravity.models.models.map(model => (
                    <li key={model.id}>
                      <span className={css.modelName}>{model.name}</span>
                      <span className={css.modelState} data-state={model.state}>
                        {model.state === 'live-available' ? t('antigravityModelLive')
                          : model.state === 'snapshot' ? t('antigravityModelSnapshot') : t('antigravityModelUnavailable')}
                      </span>
                    </li>
                  ))}
                </ul>}
            </div>
          </>
        )}
      </article>

      <article className={css.card}>
        <div className={css.cardHead}>
          <span className={css.cardTitle}>{t('providerCodex')}</span>
          <span className={css.badge} data-state={accounts.status}>
            {accounts.status === 'error' ? t('providerNotInstalled') : t('accountCount', { count: accounts.accounts.length })}
          </span>
        </div>
        {accounts.accounts.length === 0 ? <p className={css.note}>{t('codexNoAccounts')}</p> : (
          <ul className={css.accounts}>
            {accounts.accounts.map(account => {
              const usage = accounts.usage[account.id]
              const weekly = usage?.status === 'ready' ? usage.value.weeklyPercent : undefined
              const email = maskedEmail(account.email)
              return (
                <li key={account.id} className={css.account}>
                  <span className={css.accountIdentity}>
                    <span className={css.modelName}>{account.label}</span>
                    {email === undefined ? null : <span className={css.note}>{email}</span>}
                  </span>
                  <span className={css.accountMeta}>
                    <span className={css.modelState} data-state={account.active ? 'live-available' : 'snapshot'}>
                      {account.active ? t('accountActive') : t('accountUse')}
                    </span>
                    <span className={css.note}>
                      {usage?.status === 'loading' ? t('quotaReading')
                        : usage?.status === 'error' ? t('quotaFailedShort')
                          : weekly === undefined ? t('quotaNoWeekly') : t('weeklyQuota', { value: weekly })}
                    </span>
                  </span>
                  {!account.active && (usage === undefined || usage.status === 'error') ? (
                    <button
                      type="button"
                      className={css.action}
                      disabled={accounts.switchingId !== undefined}
                      onClick={() => { void readQuota(account.id).catch(() => {}) }}
                    >{t('readQuota')}</button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
        <p className={css.note}>{t('codexAddHint')}</p>
        <div className={css.actions}>
          <button type="button" className={css.action} onClick={() => { void loadAccounts() }}>{t('providerRefresh')}</button>
        </div>
      </article>
    </section>
  )
}
