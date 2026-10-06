/** Official CLI account controls within the existing provider settings surface. */
import { useEffect, useState } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClaudeClientState } from './providers/claude.ts'
import { claudeEnabledModels, saveClaudeEnabledModels } from './providers/claude.ts'
import type { ProviderPanelKey } from './locales.ts'
import css from './ProviderSettings.module.css'

export function ClaudeSettings({ state, load, login, loadModels, t }: {
  state?: ClaudeClientState | undefined
  load?: (() => Promise<void>) | undefined
  login?: (() => Promise<void>) | undefined
  loadModels?: (() => Promise<readonly { id: string; name: string }[]>) | undefined
  t: Translate<ProviderPanelKey>
}) {
  const [models, setModels] = useState<readonly { id: string; name: string }[]>([])
  const [enabled, setEnabled] = useState(() => claudeEnabledModels())
  const [modelError, setModelError] = useState(false)
  useEffect(() => {
    void load?.()
    let cancelled = false
    void loadModels?.().then(value => { if (!cancelled) setModels(value) }).catch(() => { if (!cancelled) setModelError(true) })
    return () => { cancelled = true }
  }, [load, loadModels])
  const checking = state?.status === 'checking'
  return <div>
    <p className={css.note}>{t('claudeCliHint')}</p>
    <div className={css.actions}>
      <button type="button" className={`${css.action} ${css.primary}`} disabled={!login || checking} onClick={() => { void login?.() }}>{t('claudeCliLogin')}</button>
      <button type="button" className={css.action} disabled={!load || checking} onClick={() => { void load?.() }}>{t(checking ? 'providerChecking' : 'claudeCliRefresh')}</button>
    </div>
    <code>claude auth login</code>
    {state?.loginStarted && <p className={css.note} role="status">{t('claudeCliLoginStarted')}</p>}
    {state?.errorCode && <p className={css.error} role="alert">{t(state.errorCode === 'login-launch-failed' ? 'claudeCliLoginFallback' : 'claudeCliFailed')}</p>}
    {state?.status === 'missing' ? <p className={css.note}>{t('claudeCliMissing')}</p> : state?.status === 'ready' ? <div className={css.accountModelsBlock}>
      <p>{state.label ?? t('claudeCliCurrent')}{state.plan && <span className={css.providerBadge} data-status="ready">{state.plan}</span>}</p>
      {state.authMethod !== null && <small>{t('claudeCliAuthMethod', { method: state.authMethod })}</small>}
      {state.authMethod !== null && !['claude.ai', 'oauth_token'].includes(state.authMethod) && <p className={css.note}>{t('claudeCliApiBilling')}</p>}
    </div> : !checking && <p className={css.note}>{t('claudeCliSignedOut')}</p>}
    <p className={css.note}>{t('claudeCliQuotaUnavailable')}</p>
    <div className={css.accountModelsBlock}>
      <div className={css.blockHeadRow}><span className={css.quotaGroupTitle}>{t('claudeCliModels')}</span></div>
      <p className={css.note}>{t('claudeCliModelsHint')}</p>
      {modelError && <p className={css.error} role="alert">{t('claudeCliFailed')}</p>}
      <ul className={css.models}>{models.map(model => <li key={model.id}>
        <span className={css.modelName}>{model.name}</span>
        <label className={css.switch} title={t('modelToggle')}><input type="checkbox" aria-label={model.name} checked={enabled?.has(model.id) ?? true} onChange={() => {
          const next = new Set(enabled ?? models.map(row => row.id))
          if (next.has(model.id)) next.delete(model.id); else next.add(model.id)
          saveClaudeEnabledModels(next); setEnabled(next)
        }} /><span className={css.switchSlider} /></label>
      </li>)}</ul>
    </div>
    <p className={css.note}>{t('claudeCliLimits')}</p>
  </div>
}
