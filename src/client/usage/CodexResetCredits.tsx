/** User-only redemption. Read-only inspection never prepares or consumes a reset. */
import { useEffect, useId, useRef, useState } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageKey } from './locales.ts'
import css from './UsagePage.module.css'

interface Credit { ref: string; name?: string; expiresAt?: number }
interface Details { availableCount: number; credits: Credit[] }
interface Challenge { challengeId: string; readyAt: number; expiresAt: number; creditExpiresAt?: number }
const validTime = (value: unknown): value is number => typeof value === 'number' && value > 0 && Number.isFinite(new Date(value).getTime())
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
function detailsOf(value: unknown): Details {
  if (!object(value) || !Number.isSafeInteger(value.availableCount) || (value.availableCount as number) < 0 || !Array.isArray(value.credits) || value.credits.length > 64) throw Error('Invalid reset details')
  const credits: Credit[] = value.credits.map((credit: unknown) => {
    if (!object(credit) || typeof credit.ref !== 'string' || !credit.ref || credit.ref.length > 512 || (credit.name !== undefined && (typeof credit.name !== 'string' || credit.name.length > 240)) || (credit.expiresAt !== undefined && !validTime(credit.expiresAt))) throw Error('Invalid reset credit')
    return { ref: credit.ref, ...(typeof credit.name === 'string' ? { name: credit.name } : {}), ...(validTime(credit.expiresAt) ? { expiresAt: credit.expiresAt } : {}) }
  })
  return { availableCount: value.availableCount as number, credits }
}
export interface CodexResetCreditsProps {
  rpc: ClientConnectionRpc; accountId: string; label: string; availableCount: number
  t: Translate<UsageKey>; locale: string; onReset?: (() => void | Promise<void>) | undefined
}
export function CodexResetCredits({ rpc, accountId, label, availableCount, t, locale, onReset }: CodexResetCreditsProps) {
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState<Details | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [selected, setSelected] = useState<Credit | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [result, setResult] = useState<UsageKey | null>(null)
  const [now, setNow] = useState(Date.now)
  const detailsId = useId()
  const confirmationTitle = useRef<HTMLHeadingElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const request = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; request.current?.abort() }
  }, [rpc, accountId])
  useEffect(() => {
    if (!challenge) return
    setNow(Date.now())
    confirmationTitle.current?.focus()
    const timer = setInterval(() => { const current = Date.now(); setNow(current); if (current >= challenge.expiresAt) clearInterval(timer) }, 250)
    return () => clearInterval(timer)
  }, [challenge])
  const call = async (endpoint: string, payload: object, signal: AbortSignal) => {
    const response = await rpc.call('/api', `codex-subscription/reset-credit/${endpoint}`, { id: accountId, ...payload }, signal)
    if (!response.ok) throw Error(response.error.message)
    return response.value
  }
  const operate = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (busy.current) return
    busy.current = true; setPending(true); setError(false)
    const controller = new AbortController(); request.current = controller
    try { await action(controller.signal) } catch { if (mounted.current && !controller.signal.aborted) setError(true) }
    finally { busy.current = false; if (mounted.current && !controller.signal.aborted) setPending(false) }
  }
  const inspect = () => operate(async signal => {
    const value = detailsOf(await call('inspect', {}, signal))
    if (!signal.aborted && mounted.current) setDetails(value)
  })
  const prepare = (credit: Credit) => operate(async signal => {
    const value = await call('prepare', { creditRef: credit.ref }, signal)
    if (!object(value) || typeof value.challengeId !== 'string' || !value.challengeId || value.challengeId.length > 512 || !validTime(value.readyAt) || !validTime(value.expiresAt) || value.expiresAt <= value.readyAt) throw Error('Invalid reset challenge')
    if (!signal.aborted && mounted.current) {
      setChallenge({ challengeId: value.challengeId, readyAt: value.readyAt, expiresAt: value.expiresAt, ...(validTime(value.creditExpiresAt) ? { creditExpiresAt: value.creditExpiresAt } : {}) })
      setSelected(credit); setAcknowledged(false); setResult(null); setNow(Date.now())
    }
  })
  const consume = () => {
    if (!challenge || !acknowledged || Date.now() < challenge.readyAt || Date.now() >= challenge.expiresAt) return
    const confirmed = challenge
    void operate(async signal => {
      const value = await call('consume', { challengeId: confirmed.challengeId, acknowledged: true }, signal)
      if (!object(value) || !['reset', 'nothing_to_reset', 'no_credit', 'already_redeemed'].includes(String(value.code))) throw Error('Uncertain reset response')
      if (signal.aborted || !mounted.current) return
      setChallenge(null); setSelected(null); setAcknowledged(false); setDetails(null)
      setResult(({ reset: 'resetSuccess', nothing_to_reset: 'resetNothing', no_credit: 'resetNoCredit', already_redeemed: 'resetAlreadyUsed' } as const)[value.code as 'reset' | 'nothing_to_reset' | 'no_credit' | 'already_redeemed'])
      // A refresh failure must not turn a completed redemption into a retryable consume.
      try { await onReset?.() } catch {}
      try { const next = detailsOf(await call('inspect', {}, signal)); if (!signal.aborted && mounted.current) setDetails(next) } catch { if (!signal.aborted && mounted.current) setError(true) }
    })
  }
  const format = (time?: number) => validTime(time) ? t('resetExpires', { time: new Date(time).toLocaleString(locale) }) : t('resetExpiryUnknown')
  const creditTitle = (credit: Credit, index = 0) => credit.name && /^Full reset \(Weekly\s*\+\s*5\s*hr\)$/i.test(credit.name) ? t('resetFullQuota') : credit.name ?? t('resetCreditName', { index: index + 1 })
  const earliestRef = [...details?.credits ?? []].filter(credit => credit.expiresAt !== undefined && credit.expiresAt > Date.now()).sort((a, b) => a.expiresAt! - b.expiresAt!)[0]?.ref
  const expired = !!challenge && now >= challenge.expiresAt
  const seconds = challenge ? Math.max(0, Math.ceil((challenge.readyAt - now) / 1000)) : 0
  return <div className={css.resetCredits} data-open={open}>
    <button ref={toggle} type="button" className={css.resetToggle} disabled={pending} aria-expanded={open} aria-controls={detailsId} aria-label={t('resetShow', { count: details?.availableCount ?? availableCount })} onClick={() => {
      if (open) setOpen(false)
      else { setOpen(true); if (!challenge) void inspect() }
    }}>
      <span className={css.resetHeading}><span>{t('resetSectionTitle')}</span><span className={css.resetCount}>{details?.availableCount ?? availableCount}</span></span>
      <span className={css.resetToggleHint}>{t(open ? 'resetCollapse' : 'resetExpand')}<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={open ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'} /></svg></span>
    </button>
    {open && <div id={detailsId} className={css.resetDetails} role="group" aria-label={t('resetForAccount', { name: label })} aria-busy={pending}>
      {pending && <small className={css.resetProgress} role="status">{t('resetPending')}</small>}
      {error && <div className={css.resetNotice} role="alert"><p>{t(challenge ? 'resetUncertain' : 'resetFailed')}</p>{!challenge && <button type="button" disabled={pending} onClick={() => { void inspect() }}>{t('retry')}</button>}</div>}
      {result && <p className={css.resetResult} role="status">{t(result)}</p>}
      {!challenge && details && <>
        {details.credits.length === 0 && <p>{t('resetNoCredit')}</p>}
        <div className={css.resetList}>{details.credits.map((credit, index) => <div className={css.resetCredit} key={credit.ref}>
          <span className={css.resetNumber} aria-hidden="true">{index + 1}</span>
          <div className={css.resetCreditBody}>
            <div className={css.resetCreditTitle}><strong title={credit.name}>{creditTitle(credit, index)}</strong>{details.credits.length > 1 && earliestRef === credit.ref && <span className={css.resetEarliest}>{t('resetEarliest')}</span>}</div>
            <small>{format(credit.expiresAt)}</small>
          </div>
          <button type="button" disabled={pending || (credit.expiresAt !== undefined && credit.expiresAt <= Date.now())} onClick={() => { void prepare(credit) }}>{credit.expiresAt !== undefined && credit.expiresAt <= Date.now() ? t('resetExpiredCredit') : t('resetUse')}</button>
        </div>)}</div>
      </>}
      {challenge && <div className={css.resetConfirmation}>
        <h4 ref={confirmationTitle} tabIndex={-1}>{t('resetConfirmTitle')}</h4>
        <div className={css.resetSelected}><span>{t('resetSelection', { name: label })}</span><strong title={selected?.name}>{selected ? creditTitle(selected, details?.credits.findIndex(credit => credit.ref === selected.ref) ?? 0) : t('resetCreditName', { index: 1 })}</strong><small>{format(challenge.creditExpiresAt ?? selected?.expiresAt)}</small></div>
        <p>{t('resetWarning')}</p>
        <label><input type="checkbox" checked={acknowledged} disabled={pending || expired} onChange={event => setAcknowledged(event.target.checked)} />{t('resetAcknowledge')}</label>
        {expired && <p className={css.resetNotice} role="status">{t('resetConfirmationExpired')}</p>}
        <div className={css.resetActions}>
          <button type="button" disabled={pending} onClick={() => { setChallenge(null); setSelected(null); setAcknowledged(false); setError(false); toggle.current?.focus(); void inspect() }}>{t('resetCancel')}</button>
          <button type="button" className={css.resetPrimary} disabled={pending || !acknowledged || seconds > 0 || expired} onClick={consume}>{seconds > 0 ? t('resetWait', { seconds }) : t('resetConfirm')}</button>
        </div>
      </div>}
    </div>}
  </div>
}
