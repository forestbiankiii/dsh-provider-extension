/** Settings page: Level 1 hub with expandable quick views, and Level 2 provider-only detail view. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { maskedEmail, type CodexAccountsState } from './providers/codex.ts'
import { type AntigravityState } from './providers/antigravity.ts'
import {
  loadDisabledModels, saveDisabledModels, loadAccountDisabledModels,
  saveAccountDisabledModels, type AccountDisabledModelsMap, MODELS_VISIBILITY_EVENT,
} from './selection.ts'
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
  loginCodex: () => Promise<void>
  selectCodexAccount?: (id: string) => Promise<void>
  renameCodexAccount?: (id: string, label: string) => Promise<void>
  removeCodexAccount: (id: string) => Promise<void>
  resetCodexQuota?: (id: string) => Promise<void>
  loadAntigravity: () => Promise<void>
  loginAntigravity: () => Promise<void>
  logoutAntigravity: () => Promise<void>
  selectAntigravityAccount?: (id: string) => Promise<void>
  updateAntigravityAccount?: (id: string, patch: { label?: string; tier?: string }) => Promise<void>
  renameAntigravityAccount?: (id: string, label: string) => Promise<void>
  removeAntigravityAccount?: (id: string) => Promise<void>
  readAntigravityQuota?: (id?: string) => Promise<void>
}

/** Settings-section props: the shell lends `close`, the plugin injects the rest. */
export type ProviderSettingsProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'providerExtension'>
  & InjectFace<ProviderSettingsInjected>

type PhaseKey = 'antigravityIdle' | 'antigravityPending' | 'antigravitySuccess'
  | 'antigravityCancelled' | 'antigravityExpired' | 'antigravityPortConflict' | 'antigravityFailed'

type ProviderId = 'codex' | 'antigravity' | 'claude' | 'gemini' | 'openai' | 'opencode'

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

function formatResetTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return ''
    const now = Date.now()
    const diffMs = d.getTime() - now
    if (diffMs > 0 && diffMs < 86_400_000) {
      const hours = Math.floor(diffMs / 3_600_000)
      const mins = Math.floor((diffMs % 3_600_000) / 60_000)
      if (hours > 0) return `${hours}h ${mins}m`
      return `${mins}m`
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return ''
  }
}

export const GEMINI_TIERS = ['Free', 'Pro', 'Ultra'] as const
export type GeminiTier = typeof GEMINI_TIERS[number]

function resolveAccountTier(account: { tier?: string | undefined }): GeminiTier {
  if (account.tier === 'Ultra') return 'Ultra'
  if (account.tier === 'Free') return 'Free'
  if (account.tier === 'Pro') return 'Pro'
  return 'Pro'
}

function formatCockpitTime(epochSeconds?: number): string {
  if (!epochSeconds) return '满额可用'
  try {
    const target = new Date(epochSeconds * 1000)
    const diffMs = target.getTime() - Date.now()
    if (diffMs <= 0) return '即将重置'
    const totalMins = Math.floor(diffMs / 60_000)
    const days = Math.floor(totalMins / (24 * 60))
    const hours = Math.floor((totalMins % (24 * 60)) / 60)
    const mins = totalMins % 60

    let countdown = ''
    if (days > 0) countdown = `${days}d ${hours}h ${mins}m`
    else if (hours > 0) countdown = `${hours}h ${mins}m`
    else countdown = `${Math.max(1, mins)}m`

    const mm = String(target.getMonth() + 1).padStart(2, '0')
    const dd = String(target.getDate()).padStart(2, '0')
    const hh = String(target.getHours()).padStart(2, '0')
    const min = String(target.getMinutes()).padStart(2, '0')
    return `${countdown} (${mm}/${dd} ${hh}:${min})`
  } catch {
    return ''
  }
}

function calcDaysRemaining(epochMs?: number): string {
  if (!epochMs) return ''
  const diffMs = epochMs - Date.now()
  if (diffMs <= 0) return '已过期'
  const days = Math.ceil(diffMs / (24 * 3600 * 1000))
  return `${days}天`
}

function formatDateTime(epochMs?: number): string {
  if (!epochMs) return ''
  const d = new Date(epochMs)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

function formatResetSeconds(epochSeconds?: number): string {
  if (!epochSeconds) return ''
  try {
    const diffMs = epochSeconds * 1000 - Date.now()
    if (diffMs <= 0) return '即将重置'
    const totalMinutes = Math.floor(diffMs / 60_000)
    const days = Math.floor(totalMinutes / (24 * 60))
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
    const mins = totalMinutes % 60
    if (days > 0) return `${days}天${hours > 0 ? ` ${hours}小时` : ''}后重置`
    if (hours > 0) return `${hours}小时${mins > 0 ? ` ${mins}分` : ''}后重置`
    return `${Math.max(1, mins)}分钟后重置`
  } catch {
    return ''
  }
}

/** Render two-level provider hub: Level 1 overview with quick views, and Level 2 single-provider detail. */
export function ProviderSettings({
  useAccounts, useAntigravity, loadAccounts, readQuota, loginCodex, selectCodexAccount, renameCodexAccount, removeCodexAccount, resetCodexQuota,
  loadAntigravity, loginAntigravity, logoutAntigravity, selectAntigravityAccount, updateAntigravityAccount, renameAntigravityAccount, removeAntigravityAccount, readAntigravityQuota, t,
}: ProviderSettingsProps): ReactNode {
  const accounts = useAccounts(snapshot => snapshot)
  const antigravity = useAntigravity(snapshot => snapshot)
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    codex: true,
    antigravity: true,
  })
  const [disabledModels, setDisabledModels] = useState<Set<string>>(() => loadDisabledModels())
  const [accountDisabledMap, setAccountDisabledMap] = useState<AccountDisabledModelsMap>(() => loadAccountDisabledModels())
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editingAccountLabel, setEditingAccountLabel] = useState<string>('')
  const [editingCodexAccountId, setEditingCodexAccountId] = useState<string | null>(null)
  const [editingCodexAccountLabel, setEditingCodexAccountLabel] = useState<string>('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [expandedQuotaAccounts, setExpandedQuotaAccounts] = useState<Record<string, boolean>>({})
  const [expandedCodexQuotaAccounts, setExpandedCodexQuotaAccounts] = useState<Record<string, boolean>>({})

  const toggleCodexAccountQuota = (id: string) => {
    setExpandedCodexQuotaAccounts(prev => {
      const next = { ...prev, [id]: !prev[id] }
      if (next[id] && (!accounts.usage[id] || accounts.usage[id]?.status === 'error')) {
        void readQuota(id).catch(() => {})
      }
      return next
    })
  }

  const startRenameCodex = (id: string, currentLabel: string) => {
    setEditingCodexAccountId(id)
    setEditingCodexAccountLabel(currentLabel)
  }

  const saveRenameCodex = async (id: string) => {
    if (editingCodexAccountLabel.trim() && renameCodexAccount) {
      await renameCodexAccount(id, editingCodexAccountLabel.trim())
    }
    setEditingCodexAccountId(null)
  }

  useEffect(() => {
    const handleVisibilityChange = () => {
      setDisabledModels(loadDisabledModels())
      setAccountDisabledMap(loadAccountDisabledModels())
    }
    window.addEventListener(MODELS_VISIBILITY_EVENT, handleVisibilityChange)
    return () => { window.removeEventListener(MODELS_VISIBILITY_EVENT, handleVisibilityChange) }
  }, [])

  const fetchedCodexRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (selectedProvider === 'codex' || expanded.codex) {
      for (const acc of accounts.accounts) {
        if (!acc.active && !fetchedCodexRef.current.has(acc.id) && accounts.switchingId === undefined) {
          fetchedCodexRef.current.add(acc.id)
          void readQuota(acc.id).catch(() => {})
        }
      }
    }
  }, [selectedProvider, expanded.codex, accounts.accounts, accounts.switchingId, readQuota])

  const toggleAccountModel = (accountId: string, modelId: string) => {
    setAccountDisabledMap(prev => {
      const currentList = prev[accountId] ?? []
      const nextList = currentList.includes(modelId)
        ? currentList.filter(id => id !== modelId)
        : [...currentList, modelId]
      const nextMap = { ...prev, [accountId]: nextList }
      saveAccountDisabledModels(nextMap)
      return nextMap
    })
  }

  const toggleModel = (id: string) => {
    const next = new Set(disabledModels)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDisabledModels(next)
    saveDisabledModels(next)
  }

  const toggleAccountQuota = (id: string) => {
    setExpandedQuotaAccounts(prev => {
      const next = { ...prev, [id]: !prev[id] }
      if (next[id] && !agUsage[id]) {
        void readAntigravityQuota?.(id)
      }
      return next
    })
  }

  const startRename = (id: string, currentLabel: string) => {
    setEditingAccountId(id)
    setEditingAccountLabel(currentLabel)
  }

  const saveRename = async (id: string) => {
    if (editingAccountLabel.trim() && renameAntigravityAccount) {
      await renameAntigravityAccount(id, editingAccountLabel.trim())
    }
    setEditingAccountId(null)
  }

  const login = antigravity?.view?.login
  const agAccounts = antigravity?.accounts ?? []
  const agUsage = antigravity?.usage ?? {}
  const antigravityConnected = login?.configured === true
  const codexConnected = accounts.accounts.length > 0

  useEffect(() => {
    if (agAccounts.length === 1 && agAccounts[0] && expandedQuotaAccounts[agAccounts[0].id] === undefined) {
      setExpandedQuotaAccounts({ [agAccounts[0].id]: true })
    }
  }, [agAccounts.length])

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const refreshAll = () => {
    void loadAccounts()
    void loadAntigravity()
  }

  // Automatic self-check on mount to ensure fresh status without manual refresh
  useEffect(() => {
    void loadAccounts()
    void loadAntigravity()
  }, [loadAccounts, loadAntigravity])

  // =========================================================================
  // LEVEL 2: Single Provider Detail View
  // =========================================================================
  if (selectedProvider !== null) {
    const providerTitles: Record<ProviderId, string> = {
      codex: t('providerCodex'),
      antigravity: t('providerAntigravity'),
      claude: t('providerClaude'),
      gemini: t('providerGemini'),
      openai: t('providerOpenAi'),
      opencode: t('providerOpenCode'),
    }

    return (
      <section className={css.page} data-testid="provider-settings-detail">
        <div className={css.navBack}>
          <button
            type="button"
            className={css.backButton}
            onClick={() => setSelectedProvider(null)}
          >
            ← {t('backToProviders')}
          </button>
          <div className={css.breadcrumb}>
            <span>{t('settingsNav')}</span>
            <span>/</span>
            <span className={css.breadcrumbCurrent}>{providerTitles[selectedProvider]}</span>
          </div>
        </div>

        {selectedProvider === 'codex' && (
          <article className={css.card}>
            <div className={css.cardHead}>
              <span className={css.cardTitle}>{t('providerCodex')}</span>
              <span className={css.badge} data-state={codexConnected ? 'ready' : 'idle'}>
                {accounts.status === 'error' ? t('providerError') : t('accountCount', { count: accounts.accounts.length })}
              </span>
            </div>

            <div className={css.actions}>
              <button
                type="button"
                className={`${css.action} ${css.primary}`}
                disabled={accounts.loginPending === true}
                onClick={() => { void loginCodex().catch(() => {}) }}
              >{accounts.loginPending === true ? t('providerWorking') : t('addAccount')}</button>
              {typeof accounts.loginUrl === 'string' ? (
                <a className={css.action} href={accounts.loginUrl} target="_blank" rel="noreferrer">
                  {t('codexOpenLink')}
                </a>
              ) : null}
              <button type="button" className={css.action} onClick={() => { fetchedCodexRef.current.clear(); void loadAccounts() }}>{t('providerRefresh')}</button>
            </div>

            {accounts.accounts.length === 0 ? (
              <p className={css.note}>{t('codexNoAccounts')}</p>
            ) : (
              <div className={css.accounts}>
                {accounts.accounts.map(account => {
                  const usage = accounts.usage[account.id]
                  const usageVal = usage?.status === 'ready' ? usage.value : undefined
                  const weekly = usageVal?.weeklyPercent
                  const email = maskedEmail(account.email)
                  const isEditing = editingCodexAccountId === account.id
                  const isQuotaOpen = expandedCodexQuotaAccounts[account.id] === true
                  return (
                    <div
                      key={account.id}
                      className={css.accountCardButton}
                      role="button"
                      aria-label={isQuotaOpen ? t('quotaHide') : t('quotaView')}
                      tabIndex={0}
                      onClick={() => toggleCodexAccountQuota(account.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleCodexAccountQuota(account.id)
                        }
                      }}
                    >
                      <div className={css.accountCardTop}>
                        <div className={css.accountIdentityCol}>
                          <div className={css.accountTitleRow}>
                            {isEditing ? (
                              <input
                                className={css.renameInput}
                                value={editingCodexAccountLabel}
                                onChange={e => setEditingCodexAccountLabel(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                onBlur={() => { void saveRenameCodex(account.id) }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') void saveRenameCodex(account.id)
                                  if (e.key === 'Escape') setEditingCodexAccountId(null)
                                }}
                                autoFocus
                              />
                            ) : (
                              <span
                                className={css.accountName}
                                onClick={e => {
                                  e.stopPropagation()
                                  startRenameCodex(account.id, account.label)
                                }}
                                title="点击直接重命名"
                              >
                                {account.label}
                              </span>
                            )}
                            <span className={css.accountTierBadge} data-tier="Pro">
                              {account.planType ?? 'PLUS'}
                            </span>
                            {weekly !== undefined ? (
                              <span className={css.accountTierBadge} data-tier="Pro">
                                {t('weeklyQuota', { value: weekly })}
                              </span>
                            ) : null}
                          </div>
                          {email === undefined ? null : <span className={css.note}>{email}</span>}
                        </div>
                        <div className={css.actions} onClick={e => e.stopPropagation()}>
                          {account.active ? (
                            <span className={css.modelState} data-state="live-available">
                              {t('accountActive')}
                            </span>
                          ) : selectCodexAccount ? (
                            <button
                              type="button"
                              className={css.action}
                              disabled={accounts.switchingId !== undefined}
                              onClick={e => {
                                e.stopPropagation()
                                void selectCodexAccount(account.id)
                              }}
                            >{t('accountUse')}</button>
                          ) : null}
                          {confirmingDeleteId === account.id ? (
                            <div className={css.deleteConfirmRow} onClick={e => e.stopPropagation()}>
                              <span className={css.deleteConfirmPrompt}>{t('confirmDelete')}</span>
                              <button
                                type="button"
                                className={`${css.action} ${css.danger}`}
                                onClick={e => {
                                  e.stopPropagation()
                                  setConfirmingDeleteId(null)
                                  void removeCodexAccount(account.id).catch(() => {})
                                }}
                              >{t('confirmYes')}</button>
                              <button
                                type="button"
                                className={css.action}
                                onClick={e => {
                                  e.stopPropagation()
                                  setConfirmingDeleteId(null)
                                }}
                              >{t('confirmNo')}</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={css.action}
                              disabled={accounts.switchingId !== undefined}
                              onClick={e => {
                                e.stopPropagation()
                                setConfirmingDeleteId(account.id)
                              }}
                            >{t('accountRemove')}</button>
                          )}
                          <span className={css.accountChevron} data-open={isQuotaOpen}>▼</span>
                        </div>
                      </div>

                      {isQuotaOpen && (
                        <div className={css.cockpitPanel} onClick={e => e.stopPropagation()}>
                          {/* Sub-row 1: Team Name + 重置按钮 */}
                          <div className={css.cockpitSubRow}>
                            <div className={css.cockpitTeam}>
                              <span className={css.cockpitMuted}>Team Name:</span>
                              <span className={css.cockpitText}>个人账户</span>
                            </div>
                            {usage?.status === 'ready' && usage.value.resetCredits !== undefined ? (
                              <button
                                type="button"
                                className={css.cockpitResetBtn}
                                onClick={e => {
                                  e.stopPropagation()
                                  if (resetCodexQuota) void resetCodexQuota(account.id)
                                }}
                                title="消耗重置额度重置 5h 额度"
                              >
                                ⟳ 重置 {usage.value.resetCredits}
                              </button>
                            ) : null}
                          </div>

                          {/* Sub-row 2: 登录方式与用户 ID */}
                          <div className={css.cockpitUserRow}>
                            <span>使用 Google / Password 登录</span>
                            {account.accountId ? (
                              <>
                                <span className={css.cockpitDivider}>|</span>
                                <span title={account.accountId}>
                                  用户 ID: {account.accountId.slice(0, 18)}...
                                </span>
                              </>
                            ) : null}
                          </div>

                          {/* 5h 额度条 */}
                          <div className={css.cockpitQuotaSection}>
                            <div className={css.cockpitQuotaHeader}>
                              <span className={css.cockpitQuotaTitle}>5h</span>
                              <span className={css.cockpitQuotaVal5h}>{usageVal?.shortPercent ?? 100}%</span>
                            </div>
                            <div className={css.cockpitTrack}>
                              <div
                                className={css.cockpitFill5h}
                                style={{ width: `${Math.min(100, Math.max(0, usageVal?.shortPercent ?? 100))}%` }}
                              />
                            </div>
                            <div className={css.cockpitTimeSub}>
                              {formatCockpitTime(usageVal?.shortResetsAt)}
                            </div>
                          </div>

                          {/* Weekly 额度条 */}
                          <div className={css.cockpitQuotaSection}>
                            <div className={css.cockpitQuotaHeader}>
                              <span className={css.cockpitQuotaTitle}>Weekly</span>
                              <span className={css.cockpitQuotaValWeekly}>{usageVal?.weeklyPercent ?? 100}%</span>
                            </div>
                            <div className={css.cockpitTrack}>
                              <div
                                className={css.cockpitFillWeekly}
                                style={{ width: `${Math.min(100, Math.max(0, usageVal?.weeklyPercent ?? 100))}%` }}
                              />
                            </div>
                            <div className={css.cockpitTimeSub}>
                              {formatCockpitTime(usageVal?.weeklyResetsAt)}
                            </div>
                          </div>

                          {/* 订阅有效期 Banner */}
                          {account.expiresAt ? (
                            <div className={css.cockpitSubBanner}>
                              <div className={css.cockpitSubLeft}>
                                <span>📅</span>
                                <span>订阅有效期 {calcDaysRemaining(account.expiresAt)}</span>
                              </div>
                              <div className={css.cockpitSubRight}>
                                {formatDateTime(account.expiresAt)}
                              </div>
                            </div>
                          ) : null}

                          {usage?.status === 'error' && (
                            <div className={css.quotaErrorRow}>
                              <span className={css.note}>{t('quotaFailedShort')}</span>
                              <button
                                type="button"
                                className={css.action}
                                onClick={() => { void readQuota(account.id).catch(() => {}) }}
                              >
                                {t('readQuota')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        )}

        {selectedProvider === 'antigravity' && (
          <article className={css.card}>
            <div className={css.cardHead}>
              <span className={css.cardTitle}>{t('providerAntigravity')}</span>
              <span className={css.badge} data-state={antigravityConnected ? 'ready' : 'idle'}>
                {antigravity.status === 'error' ? t('providerError')
                  : antigravity.status === 'checking' ? t('providerChecking')
                    : antigravityConnected ? t('providerStatusConnected') : t('providerStatusIdle')}
              </span>
            </div>

            {antigravity.status === 'absent' ? (
              <p className={css.note}>{t('antigravityInstallHint')}</p>
            ) : (
              <>
                <div className={css.actions}>
                  <button
                    type="button"
                    className={`${css.action} ${css.primary}`}
                    disabled={antigravity.busy === true || login?.phase === 'pending'}
                    onClick={() => { void loginAntigravity().catch(() => {}) }}
                  >{antigravity.busy === true ? t('providerWorking') : t('addAccount')}</button>
                  {typeof login?.authorizationUrl === 'string' ? (
                    <a className={css.action} href={login.authorizationUrl} target="_blank" rel="noreferrer">
                      {t('antigravityOpenLink')}
                    </a>
                  ) : null}
                  <button type="button" className={css.action} onClick={() => { void loadAntigravity() }}>{t('providerRefresh')}</button>
                </div>

                {antigravity.error === undefined ? null : <p className={css.error} role="alert">{antigravity.error}</p>}

                <div className={css.block}>
                  <div className={css.blockHeadRow}>
                    <span className={css.blockTitle}>{t('antigravityAccounts')}</span>
                    <span className={css.badge}>{t('accountCount', { count: agAccounts.length })}</span>
                  </div>
                  {agAccounts.length === 0 ? (
                    <p className={css.note}>{t('antigravityNoAccounts')}</p>
                  ) : (
                    <div className={css.accounts}>
                      {agAccounts.map(account => {
                        const email = account.email ? maskedEmail(account.email) : (account.active && login?.maskedEmail ? login.maskedEmail : 'Google 账号已绑定')
                        const tier = resolveAccountTier(account)
                        const isEditing = editingAccountId === account.id
                        const isQuotaOpen = expandedQuotaAccounts[account.id] === true
                        const quota = agUsage[account.id] ?? (account.active ? agUsage['default'] : undefined)
                        return (
                          <div
                            key={account.id}
                            className={css.accountCardButton}
                            role="button"
                            aria-label={isQuotaOpen ? t('quotaHide') : t('quotaView')}
                            tabIndex={0}
                            onClick={() => toggleAccountQuota(account.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                toggleAccountQuota(account.id)
                              }
                            }}
                          >
                            <div className={css.accountCardTop}>
                              <div className={css.accountIdentityCol}>
                                <div className={css.accountTitleRow}>
                                  {isEditing ? (
                                    <input
                                      className={css.renameInput}
                                      value={editingAccountLabel}
                                      onChange={e => setEditingAccountLabel(e.target.value)}
                                      onClick={e => e.stopPropagation()}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') void saveRename(account.id)
                                        if (e.key === 'Escape') setEditingAccountId(null)
                                      }}
                                      autoFocus
                                    />
                                  ) : (
                                    <span
                                      className={css.accountName}
                                      onClick={e => {
                                        e.stopPropagation()
                                        startRename(account.id, account.label)
                                      }}
                                      title="点击直接重命名"
                                    >
                                      {account.label}
                                    </span>
                                  )}
                                  <span className={css.accountTierBadge} data-tier={tier}>
                                    {tier}
                                  </span>
                                </div>
                                <span className={css.note}>{email}</span>
                              </div>
                              <div className={css.actions} onClick={e => e.stopPropagation()}>
                                <span className={css.modelState} data-state={account.active ? 'live-available' : 'snapshot'}>
                                  {account.active ? t('accountActive') : t('accountUse')}
                                </span>
                                {isEditing ? (
                                  <>
                                    <button type="button" className={css.action} onClick={() => { void saveRename(account.id) }}>{t('renameSave')}</button>
                                    <button type="button" className={css.action} onClick={() => setEditingAccountId(null)}>{t('renameCancel')}</button>
                                  </>
                                ) : null}
                                {!account.active && selectAntigravityAccount ? (
                                  <button
                                    type="button"
                                    className={css.action}
                                    disabled={antigravity.switchingId !== undefined}
                                    onClick={() => { void selectAntigravityAccount(account.id) }}
                                  >{t('accountUse')}</button>
                                ) : null}
                                {removeAntigravityAccount ? (
                                  confirmingDeleteId === account.id ? (
                                    <div className={css.deleteConfirmRow} onClick={e => e.stopPropagation()}>
                                      <span className={css.deleteConfirmPrompt}>{t('confirmDelete')}</span>
                                      <button
                                        type="button"
                                        className={`${css.action} ${css.danger}`}
                                        onClick={() => {
                                          setConfirmingDeleteId(null)
                                          void removeAntigravityAccount(account.id)
                                        }}
                                      >{t('confirmYes')}</button>
                                      <button
                                        type="button"
                                        className={css.action}
                                        onClick={() => setConfirmingDeleteId(null)}
                                      >{t('confirmNo')}</button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className={css.action}
                                      disabled={antigravity.switchingId !== undefined}
                                      onClick={e => {
                                        e.stopPropagation()
                                        setConfirmingDeleteId(account.id)
                                      }}
                                    >{t('accountRemove')}</button>
                                  )
                                ) : null}
                                <span className={css.accountChevron} data-open={isQuotaOpen}>▼</span>
                              </div>
                            </div>

                            {isQuotaOpen ? (
                              <div className={css.accountExpandQuota} onClick={e => e.stopPropagation()}>
                                <div className={css.blockHeadRow}>
                                  <span className={css.quotaGroupTitle}>{t('quotaBalance')}</span>
                                  <button
                                    type="button"
                                    className={css.action}
                                    onClick={() => { void readAntigravityQuota?.(account.id) }}
                                  >{t('readQuota')}</button>
                                </div>
                                {quota?.groups && quota.groups.length > 0 ? (
                                  <div className={css.quotaCards}>
                                    {quota.groups.map(group => {
                                      const groupTitle = group.group === 'gemini' ? t('quotaGemini') : t('quotaClaude')
                                      return (
                                        <div key={group.group} className={css.quotaCard}>
                                          <span className={css.quotaGroupTitle}>{groupTitle}</span>
                                          <div className={css.quotaWindows}>
                                            {group.windows.map(win => {
                                              const pct = Math.round(win.remainingFraction * 100)
                                              const label = win.window === '5h' ? t('quota5h', { value: pct }) : t('quotaWeeklyFraction', { value: pct })
                                              const resetText = win.resetTime ? formatResetTime(win.resetTime) : ''
                                              return (
                                                <div key={win.window} className={css.quotaWindowItem}>
                                                  <div className={css.quotaWindowHead}>
                                                    <span className={css.quotaWindowLabel}>{label}</span>
                                                    {resetText ? <span className={css.quotaResetTime}>{t('quotaResetAt', { time: resetText })}</span> : null}
                                                  </div>
                                                  <progress className={css.quotaBar} max={100} value={pct} />
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className={css.note}>{t('quotaNoData')}</p>
                                )}

                                <div className={css.accountModelsBlock}>
                                  <div className={css.blockHeadRow}>
                                    <span className={css.quotaGroupTitle}>{t('antigravityModels')}</span>
                                  </div>
                                  {antigravity.models === undefined || antigravity.models.models.length === 0 ? (
                                    <p className={css.note}>{t('antigravityNoModels')}</p>
                                  ) : (
                                    <ul className={css.models}>
                                      {antigravity.models.models.map(model => {
                                        const isModelDisabled = accountDisabledMap[account.id]?.includes(model.id)
                                        return (
                                          <li key={model.id}>
                                            <span className={css.modelName}>{model.name}</span>
                                            <div className={css.modelToggleRow}>
                                              {model.state === 'unavailable' ? (
                                                <span className={css.modelState} data-state="unavailable">
                                                  {t('antigravityModelUnavailable')}
                                                </span>
                                              ) : null}
                                              <label className={css.switch} title={t('modelToggle')}>
                                                <input
                                                  type="checkbox"
                                                  checked={!isModelDisabled}
                                                  onChange={() => toggleAccountModel(account.id, model.id)}
                                                />
                                                <span className={css.switchSlider} />
                                              </label>
                                            </div>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </article>
        )}

        {selectedProvider !== 'codex' && selectedProvider !== 'antigravity' && (
          <article className={css.card}>
            <div className={css.cardHead}>
              <span className={css.cardTitle}>{providerTitles[selectedProvider]}</span>
              <span className={css.badge} data-state="roadmap">{t('providerStatusRoadmap')}</span>
            </div>
            <p className={css.note}>{t('roadmapNotice')}</p>
          </article>
        )}
      </section>
    )
  }

  // =========================================================================
  // LEVEL 1: Providers Overview & Expandable Quick Views
  // =========================================================================
  return (
    <section className={css.page} data-testid="provider-settings">
      <header className={css.head}>
        <div>
          <h2 className={css.title}>{t('settingsNav')}</h2>
          <p className={css.intro}>{t('providersIntro')}</p>
        </div>
      </header>

      <div className={css.providerList}>
        {/* 1. Antigravity (Google) */}
        <article className={css.providerCard}>
          <div
            className={css.providerCardHead}
            onClick={() => toggleExpand('antigravity')}
          >
            <div className={css.providerMain}>
              <div className={css.providerIcon} data-provider="antigravity">AG</div>
              <div className={css.providerTitles}>
                <span className={css.providerTitle}>{t('providerAntigravity')}</span>
                <span className={css.providerSubtitle}>
                  {login?.configured ? `${t('antigravitySuccess')} · ${t('antigravityProject')}: ${login.projectAvailable ? t('antigravityProjectReady') : t('antigravityProjectUnavailable')}` : t(phaseKey(login?.phase))}
                </span>
              </div>
            </div>
            <div className={css.providerRight} onClick={e => e.stopPropagation()}>
              <span className={css.providerBadge} data-status={antigravityConnected ? 'ready' : 'idle'}>
                {antigravityConnected ? t('providerStatusConnected') : t('providerStatusIdle')}
              </span>
              <button
                type="button"
                className={`${css.action} ${css.primary}`}
                onClick={() => setSelectedProvider('antigravity')}
              >
                {t('providerManage')} →
              </button>
              <span
                className={css.accountChevron}
                data-open={expanded.antigravity}
                onClick={() => toggleExpand('antigravity')}
              >▼</span>
            </div>
          </div>

          {expanded.antigravity && (
            <div className={css.quickView}>
              {antigravity.status === 'absent' ? (
                <p className={css.note}>{t('antigravityInstallHint')}</p>
              ) : (
                <>
                  <div className={css.actions}>
                    <button
                      type="button"
                      className={`${css.action} ${css.primary}`}
                      disabled={antigravity.busy === true || login?.phase === 'pending'}
                      onClick={() => { void loginAntigravity().catch(() => {}) }}
                    >{antigravity.busy === true ? t('providerWorking') : t('addAccount')}</button>
                    {typeof login?.authorizationUrl === 'string' ? (
                      <a className={css.action} href={login.authorizationUrl} target="_blank" rel="noreferrer">
                        {t('antigravityOpenLink')}
                      </a>
                    ) : null}
                    <button type="button" className={css.action} onClick={() => { void loadAntigravity() }}>{t('providerRefresh')}</button>
                  </div>

                  {agAccounts.length > 0 ? (
                    <div className={css.block}>
                      <span className={css.blockTitle}>{t('antigravityAccounts')}</span>
                      <div className={css.accounts}>
                        {agAccounts.map(account => {
                          const email = account.email ? maskedEmail(account.email) : (account.active && login?.maskedEmail ? login.maskedEmail : 'Google 账号已绑定')
                          const tier = resolveAccountTier(account)
                          const isQuotaOpen = expandedQuotaAccounts[account.id] === true
                          const quota = agUsage[account.id] ?? (account.active ? agUsage['default'] : undefined)
                          return (
                            <div
                              key={account.id}
                              className={css.accountCardButton}
                              role="button"
                              aria-label={isQuotaOpen ? t('quotaHide') : t('quotaView')}
                              tabIndex={0}
                              onClick={() => toggleAccountQuota(account.id)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  toggleAccountQuota(account.id)
                                }
                              }}
                            >
                              <div className={css.accountCardTop}>
                                <div className={css.accountIdentityCol}>
                                  <div className={css.accountTitleRow}>
                                    {editingAccountId === account.id ? (
                                      <input
                                        className={css.renameInput}
                                        value={editingAccountLabel}
                                        onChange={e => setEditingAccountLabel(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        onBlur={() => { void saveRename(account.id) }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') void saveRename(account.id)
                                          if (e.key === 'Escape') setEditingAccountId(null)
                                        }}
                                        autoFocus
                                      />
                                    ) : (
                                      <span
                                        className={css.accountName}
                                        onClick={e => {
                                          e.stopPropagation()
                                          startRename(account.id, account.label)
                                        }}
                                        title="点击直接重命名"
                                      >
                                        {account.label}
                                      </span>
                                    )}
                                    <span className={css.accountTierBadge} data-tier={tier}>
                                      {tier}
                                    </span>
                                  </div>
                                  <span className={css.note}>{email}</span>
                                </div>
                                <div className={css.actions} onClick={e => e.stopPropagation()}>
                                  <span className={css.modelState} data-state={account.active ? 'live-available' : 'snapshot'}>
                                    {account.active ? t('accountActive') : t('accountUse')}
                                  </span>
                                  {!account.active && selectAntigravityAccount ? (
                                    <button
                                      type="button"
                                      className={css.action}
                                      disabled={antigravity.switchingId !== undefined}
                                      onClick={() => { void selectAntigravityAccount(account.id) }}
                                    >{t('accountUse')}</button>
                                  ) : null}
                                  <span className={css.accountChevron} data-open={isQuotaOpen}>▼</span>
                                </div>
                              </div>

                              {isQuotaOpen ? (
                                <div className={css.accountExpandQuota} onClick={e => e.stopPropagation()}>
                                  <div className={css.blockHeadRow}>
                                    <span className={css.quotaGroupTitle}>{t('quotaBalance')}</span>
                                    <button
                                      type="button"
                                      className={css.action}
                                      onClick={() => { void readAntigravityQuota?.(account.id) }}
                                    >{t('readQuota')}</button>
                                  </div>
                                  {quota?.groups && quota.groups.length > 0 ? (
                                    <div className={css.quotaCards}>
                                      {quota.groups.map(group => {
                                        const groupTitle = group.group === 'gemini' ? t('quotaGemini') : t('quotaClaude')
                                        return (
                                          <div key={group.group} className={css.quotaCard}>
                                            <span className={css.quotaGroupTitle}>{groupTitle}</span>
                                            <div className={css.quotaWindows}>
                                              {group.windows.map(win => {
                                                const pct = Math.round(win.remainingFraction * 100)
                                                const label = win.window === '5h' ? t('quota5h', { value: pct }) : t('quotaWeeklyFraction', { value: pct })
                                                const resetText = win.resetTime ? formatResetTime(win.resetTime) : ''
                                                return (
                                                  <div key={win.window} className={css.quotaWindowItem}>
                                                    <div className={css.quotaWindowHead}>
                                                      <span className={css.quotaWindowLabel}>{label}</span>
                                                      {resetText ? <span className={css.quotaResetTime}>{t('quotaResetAt', { time: resetText })}</span> : null}
                                                    </div>
                                                    <progress className={css.quotaBar} max={100} value={pct} />
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className={css.note}>{t('quotaNoData')}</p>
                                  )}

                                  <div className={css.accountModelsBlock}>
                                    <div className={css.blockHeadRow}>
                                      <span className={css.quotaGroupTitle}>{t('antigravityModels')}</span>
                                    </div>
                                    {antigravity.models === undefined || antigravity.models.models.length === 0 ? (
                                      <p className={css.note}>{t('antigravityNoModels')}</p>
                                    ) : (
                                      <ul className={css.models}>
                                        {antigravity.models.models.map(model => {
                                          const isModelDisabled = accountDisabledMap[account.id]?.includes(model.id)
                                          return (
                                            <li key={model.id}>
                                              <span className={css.modelName}>{model.name}</span>
                                              <div className={css.modelToggleRow}>
                                                {model.state === 'unavailable' ? (
                                                  <span className={css.modelState} data-state="unavailable">
                                                    {t('antigravityModelUnavailable')}
                                                  </span>
                                                ) : null}
                                                <label className={css.switch} title={t('modelToggle')}>
                                                  <input
                                                    type="checkbox"
                                                    checked={!isModelDisabled}
                                                    onChange={() => toggleAccountModel(account.id, model.id)}
                                                  />
                                                  <span className={css.switchSlider} />
                                                </label>
                                              </div>
                                            </li>
                                          )
                                        })}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </article>

        {/* 2. ChatGPT / Codex 订阅 */}
        <article className={css.providerCard}>
          <div
            className={css.providerCardHead}
            onClick={() => toggleExpand('codex')}
          >
            <div className={css.providerMain}>
              <div className={css.providerIcon} data-provider="codex">GPT</div>
              <div className={css.providerTitles}>
                <span className={css.providerTitle}>{t('providerCodex')}</span>
                <span className={css.providerSubtitle}>
                  {codexConnected ? t('accountCount', { count: accounts.accounts.length }) : t('codexNoAccounts')}
                </span>
              </div>
            </div>
            <div className={css.providerRight} onClick={e => e.stopPropagation()}>
              <span className={css.providerBadge} data-status={codexConnected ? 'ready' : 'idle'}>
                {codexConnected ? t('providerStatusConnected') : t('providerStatusIdle')}
              </span>
              <button
                type="button"
                className={`${css.action} ${css.primary}`}
                onClick={() => setSelectedProvider('codex')}
              >
                {t('providerManage')} →
              </button>
              <span
                className={css.accountChevron}
                data-open={expanded.codex}
                onClick={() => toggleExpand('codex')}
              >▼</span>
            </div>
          </div>

          {expanded.codex && (
            <div className={css.quickView}>
              <div className={css.actions}>
                <button
                  type="button"
                  className={`${css.action} ${css.primary}`}
                  disabled={accounts.loginPending === true}
                  onClick={() => { void loginCodex().catch(() => {}) }}
                >{accounts.loginPending === true ? t('providerWorking') : t('addAccount')}</button>
                {typeof accounts.loginUrl === 'string' ? (
                  <a className={css.action} href={accounts.loginUrl} target="_blank" rel="noreferrer">
                    {t('codexOpenLink')}
                  </a>
                ) : null}
                <button type="button" className={css.action} onClick={() => { fetchedCodexRef.current.clear(); void loadAccounts() }}>{t('providerRefresh')}</button>
              </div>

              {accounts.accounts.length === 0 ? (
                <p className={css.note}>{t('codexNoAccounts')}</p>
              ) : (
                <div className={css.accounts}>
                  {accounts.accounts.map(account => {
                    const usage = accounts.usage[account.id]
                    const usageVal = usage?.status === 'ready' ? usage.value : undefined
                    const weekly = usageVal?.weeklyPercent
                    const email = maskedEmail(account.email)
                    const isEditing = editingCodexAccountId === account.id
                    const isQuotaOpen = expandedCodexQuotaAccounts[account.id] === true
                    return (
                      <div
                        key={account.id}
                        className={css.accountCardButton}
                        role="button"
                        aria-label={isQuotaOpen ? t('quotaHide') : t('quotaView')}
                        tabIndex={0}
                        onClick={() => toggleCodexAccountQuota(account.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleCodexAccountQuota(account.id)
                          }
                        }}
                      >
                        <div className={css.accountCardTop}>
                          <div className={css.accountIdentityCol}>
                            <div className={css.accountTitleRow}>
                              {isEditing ? (
                                <input
                                  className={css.renameInput}
                                  value={editingCodexAccountLabel}
                                  onChange={e => setEditingCodexAccountLabel(e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  onBlur={() => { void saveRenameCodex(account.id) }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') void saveRenameCodex(account.id)
                                    if (e.key === 'Escape') setEditingCodexAccountId(null)
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <span
                                  className={css.accountName}
                                  onClick={e => {
                                    e.stopPropagation()
                                    startRenameCodex(account.id, account.label)
                                  }}
                                  title="点击直接重命名"
                                >
                                  {account.label}
                                </span>
                              )}
                              <span className={css.accountTierBadge} data-tier="Pro">
                                {account.planType ?? 'PLUS'}
                              </span>
                              {weekly !== undefined ? (
                                <span className={css.accountTierBadge} data-tier="Pro">
                                  {t('weeklyQuota', { value: weekly })}
                                </span>
                              ) : null}
                            </div>
                            {email === undefined ? null : <span className={css.note}>{email}</span>}
                          </div>
                          <div className={css.actions} onClick={e => e.stopPropagation()}>
                            {account.active ? (
                              <span className={css.modelState} data-state="live-available">
                                {t('accountActive')}
                              </span>
                            ) : selectCodexAccount ? (
                              <button
                                type="button"
                                className={css.action}
                                disabled={accounts.switchingId !== undefined}
                                onClick={e => {
                                  e.stopPropagation()
                                  void selectCodexAccount(account.id)
                                }}
                              >{t('accountUse')}</button>
                            ) : null}
                            {confirmingDeleteId === account.id ? (
                              <div className={css.deleteConfirmRow} onClick={e => e.stopPropagation()}>
                                <span className={css.deleteConfirmPrompt}>{t('confirmDelete')}</span>
                                <button
                                  type="button"
                                  className={`${css.action} ${css.danger}`}
                                  onClick={e => {
                                    e.stopPropagation()
                                    setConfirmingDeleteId(null)
                                    void removeCodexAccount(account.id).catch(() => {})
                                  }}
                                >{t('confirmYes')}</button>
                                <button
                                  type="button"
                                  className={css.action}
                                  onClick={e => {
                                    e.stopPropagation()
                                    setConfirmingDeleteId(null)
                                  }}
                                >{t('confirmNo')}</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={css.action}
                                disabled={accounts.switchingId !== undefined}
                                onClick={e => {
                                  e.stopPropagation()
                                  setConfirmingDeleteId(account.id)
                                }}
                              >{t('accountRemove')}</button>
                            )}
                            <span className={css.accountChevron} data-open={isQuotaOpen}>▼</span>
                          </div>
                        </div>

                        {isQuotaOpen && (
                          <div className={css.cockpitPanel} onClick={e => e.stopPropagation()}>
                            {/* Sub-row 1: Team Name + 重置按钮 */}
                            <div className={css.cockpitSubRow}>
                              <div className={css.cockpitTeam}>
                                <span className={css.cockpitMuted}>Team Name:</span>
                                <span className={css.cockpitText}>个人账户</span>
                              </div>
                              {usage?.status === 'ready' && usage.value.resetCredits !== undefined ? (
                                <button
                                  type="button"
                                  className={css.cockpitResetBtn}
                                  onClick={e => {
                                    e.stopPropagation()
                                    if (resetCodexQuota) void resetCodexQuota(account.id)
                                  }}
                                  title="消耗重置额度重置 5h 额度"
                                >
                                  ⟳ 重置 {usage.value.resetCredits}
                                </button>
                              ) : null}
                            </div>

                            {/* Sub-row 2: 登录方式与用户 ID */}
                            <div className={css.cockpitUserRow}>
                              <span>使用 Google / Password 登录</span>
                              {account.accountId ? (
                                <>
                                  <span className={css.cockpitDivider}>|</span>
                                  <span title={account.accountId}>
                                    用户 ID: {account.accountId.slice(0, 18)}...
                                  </span>
                                </>
                              ) : null}
                            </div>

                            {/* 5h 额度条 */}
                            <div className={css.cockpitQuotaSection}>
                              <div className={css.cockpitQuotaHeader}>
                                <span className={css.cockpitQuotaTitle}>5h</span>
                                <span className={css.cockpitQuotaVal5h}>{usageVal?.shortPercent ?? 100}%</span>
                              </div>
                              <div className={css.cockpitTrack}>
                                <div
                                  className={css.cockpitFill5h}
                                  style={{ width: `${Math.min(100, Math.max(0, usageVal?.shortPercent ?? 100))}%` }}
                                />
                              </div>
                              <div className={css.cockpitTimeSub}>
                                {formatCockpitTime(usageVal?.shortResetsAt)}
                              </div>
                            </div>

                            {/* Weekly 额度条 */}
                            <div className={css.cockpitQuotaSection}>
                              <div className={css.cockpitQuotaHeader}>
                                <span className={css.cockpitQuotaTitle}>Weekly</span>
                                <span className={css.cockpitQuotaValWeekly}>{usageVal?.weeklyPercent ?? 100}%</span>
                              </div>
                              <div className={css.cockpitTrack}>
                                <div
                                  className={css.cockpitFillWeekly}
                                  style={{ width: `${Math.min(100, Math.max(0, usageVal?.weeklyPercent ?? 100))}%` }}
                                />
                              </div>
                              <div className={css.cockpitTimeSub}>
                                {formatCockpitTime(usageVal?.weeklyResetsAt)}
                              </div>
                            </div>

                            {/* 订阅有效期 Banner */}
                            {account.expiresAt ? (
                              <div className={css.cockpitSubBanner}>
                                <div className={css.cockpitSubLeft}>
                                  <span>📅</span>
                                  <span>订阅有效期 {calcDaysRemaining(account.expiresAt)}</span>
                                </div>
                                <div className={css.cockpitSubRight}>
                                  {formatDateTime(account.expiresAt)}
                                </div>
                              </div>
                            ) : null}

                            {usage?.status === 'error' && (
                              <div className={css.quotaErrorRow}>
                                <span className={css.note}>{t('quotaFailedShort')}</span>
                                <button
                                  type="button"
                                  className={css.action}
                                  onClick={() => { void readQuota(account.id).catch(() => {}) }}
                                >
                                  {t('readQuota')}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </article>

        {/* 3. Claude (Anthropic) */}
        <article className={css.providerCard}>
          <div
            className={css.providerCardHead}
            onClick={() => toggleExpand('claude')}
          >
            <div className={css.providerMain}>
              <div className={css.providerIcon} data-provider="claude">CL</div>
              <div className={css.providerTitles}>
                <span className={css.providerTitle}>{t('providerClaude')}</span>
                <span className={css.providerSubtitle}>{t('providerClaudeDesc')}</span>
              </div>
            </div>
            <div className={css.providerRight} onClick={e => e.stopPropagation()}>
              <span className={css.providerBadge} data-status="roadmap">
                {t('providerStatusRoadmap')}
              </span>
              <button
                type="button"
                className={css.action}
                onClick={() => setSelectedProvider('claude')}
              >
                {t('providerManage')} →
              </button>
              <span
                className={css.accountChevron}
                data-open={expanded.claude}
                onClick={() => toggleExpand('claude')}
              >▼</span>
            </div>
          </div>
          {expanded.claude && (
            <div className={css.quickView}>
              <p className={css.note}>{t('roadmapNotice')}</p>
            </div>
          )}
        </article>

        {/* 4. Google Gemini API */}
        <article className={css.providerCard}>
          <div className={css.providerCardHead}>
            <div className={css.providerMain} onClick={() => toggleExpand('gemini')}>
              <div className={css.providerIcon} data-provider="gemini">GM</div>
              <div className={css.providerTitles}>
                <span className={css.providerTitle}>{t('providerGemini')}</span>
                <span className={css.providerSubtitle}>{t('providerGeminiDesc')}</span>
              </div>
            </div>
            <div className={css.providerRight}>
              <span className={css.providerBadge} data-status="roadmap">
                {t('providerStatusRoadmap')}
              </span>
              <button
                type="button"
                className={css.action}
                onClick={() => setSelectedProvider('gemini')}
              >
                {t('providerManage')} →
              </button>
            </div>
          </div>
        </article>

        {/* 5. OpenAI API */}
        <article className={css.providerCard}>
          <div className={css.providerCardHead}>
            <div className={css.providerMain} onClick={() => toggleExpand('openai')}>
              <div className={css.providerIcon} data-provider="openai">OA</div>
              <div className={css.providerTitles}>
                <span className={css.providerTitle}>{t('providerOpenAi')}</span>
                <span className={css.providerSubtitle}>{t('providerOpenAiDesc')}</span>
              </div>
            </div>
            <div className={css.providerRight}>
              <span className={css.providerBadge} data-status="roadmap">
                {t('providerStatusRoadmap')}
              </span>
              <button
                type="button"
                className={css.action}
                onClick={() => setSelectedProvider('openai')}
              >
                {t('providerManage')} →
              </button>
            </div>
          </div>
        </article>

        {/* 6. OpenCode */}
        <article className={css.providerCard}>
          <div className={css.providerCardHead}>
            <div className={css.providerMain} onClick={() => toggleExpand('opencode')}>
              <div className={css.providerIcon} data-provider="opencode">OC</div>
              <div className={css.providerTitles}>
                <span className={css.providerTitle}>{t('providerOpenCode')}</span>
                <span className={css.providerSubtitle}>{t('providerOpenCodeDesc')}</span>
              </div>
            </div>
            <div className={css.providerRight}>
              <span className={css.providerBadge} data-status="roadmap">
                {t('providerStatusRoadmap')}
              </span>
              <button
                type="button"
                className={css.action}
                onClick={() => setSelectedProvider('opencode')}
              >
                {t('providerManage')} →
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
