/** User-only redemption. Read-only inspection never prepares or consumes a reset. */
import { useEffect, useRef, useState } from 'react'
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
    const timer = setInterval(() => setNow(Date.now()), 250)
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
  const expired = !!challenge && now >= challenge.expiresAt
  const seconds = challenge ? Math.max(0, Math.ceil((challenge.readyAt - now) / 1000)) : 0
  return <div className={css.resetCredits}>
    <button type="button" className={css.resetToggle} disabled={pending} aria-expanded={open} onClick={() => {
      if (open) { setOpen(false); setChallenge(null); setSelected(null); setAcknowledged(false); setError(false) }
      else { setOpen(true); void inspect() }
    }}>{t('resetShow', { count: details?.availableCount ?? availableCount })}</button>
    {open && <div className={css.resetDetails} role="group" aria-label={t('resetForAccount', { name: label })}>
      <p>{t('resetForAccount', { name: label })}</p>
      {pending && <small role="status">{t('resetPending')}</small>}
      {error && <div role="alert"><p>{t(challenge ? 'resetUncertain' : 'resetFailed')}</p>{!challenge && <button type="button" disabled={pending} onClick={() => { void inspect() }}>{t('retry')}</button>}</div>}
      {result && <p role="status">{t(result)}</p>}
      {!challenge && details && <>
        {details.credits.length === 0 && <p>{t('resetNoCredit')}</p>}
        {details.credits.map((credit, index) => <div className={css.resetCredit} key={credit.ref}>
          <div><strong>{credit.name ?? t('resetCreditName', { index: index + 1 })}</strong><small>{format(credit.expiresAt)}</small></div>
          <button type="button" disabled={pending || (credit.expiresAt !== undefined && credit.expiresAt <= Date.now())} onClick={() => { void prepare(credit) }}>{t('resetUse')}</button>
        </div>)}
      </>}
      {challenge && <div className={css.resetConfirmation}>
        <strong>{selected?.name ?? t('resetConfirmTitle')}</strong>
        <small>{format(challenge.creditExpiresAt ?? selected?.expiresAt)}</small>
        <p>{t('resetWarning')}</p>
        <label><input type="checkbox" checked={acknowledged} disabled={pending || expired} onChange={event => setAcknowledged(event.target.checked)} />{t('resetAcknowledge')}</label>
        {expired && <p role="status">{t('resetConfirmationExpired')}</p>}
        <div className={css.resetActions}>
          <button type="button" disabled={pending || !acknowledged || seconds > 0 || expired} onClick={consume}>{seconds > 0 ? t('resetWait', { seconds }) : t('resetConfirm')}</button>
          <button type="button" disabled={pending} onClick={() => { setChallenge(null); setSelected(null); setAcknowledged(false); setError(false); void inspect() }}>{t('resetCancel')}</button>
        </div>
      </div>}
    </div>}
  </div>
}
