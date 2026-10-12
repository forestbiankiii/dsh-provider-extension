/** Shared acknowledged-save control for response detail and Standard/Fast. */
import { useEffect, useRef, useState } from 'react'
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx'
import type { ProviderPanelKey } from './locales.ts'
import css from './ProviderSettings.module.css'
export interface CodexSelectView { value: string; writable: boolean; note?: ProviderPanelKey }
interface Props extends CodexVerbosityProps {
  choices: readonly string[]
  labels: readonly ProviderPanelKey[]
  title: ProviderPanelKey
  hint: ProviderPanelKey
  savedLabel: ProviderPanelKey
  load: (rpc: CodexVerbosityProps['rpc'], value?: string, signal?: AbortSignal) => Promise<CodexSelectView>
}
export function CodexSelectSetting({ rpc, subscribe, t, choices, labels, title, hint, savedLabel, load }: Props) {
  const [view, setView] = useState<CodexSelectView | null>(null)
  const [revision, setRevision] = useState(0)
  const [reading, setReading] = useState(true)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => subscribe?.(() => setRevision(value => value + 1)), [subscribe])
  useEffect(() => {
    if (saving.current) return
    const abort = new AbortController()
    setReading(true)
    void load(rpc, undefined, abort.signal).then(value => {
      if (!abort.signal.aborted) { setView(value); setError(null); setSaved(false) }
    }).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!abort.signal.aborted) setReading(false) })
    return () => { abort.abort() }
  }, [rpc, revision, load])
  const save = async (value: string) => {
    if (reading || saving.current || !view?.writable || value === view.value) return
    saving.current = true; setPending(true); setSaved(false); setError(null)
    try {
      const result = await load(rpc, value)
      if (mounted.current) { setView(result); setSaved(true) }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally { saving.current = false; if (mounted.current) setPending(false) }
  }
  return <div className={`${css.fieldGroup} ${css.verbositySetting}`}>
    <label className={css.fieldLabel}>{t(title)}
      <select aria-label={t(title)} value={view?.value ?? choices[0]} disabled={reading || pending || !view?.writable}
        onChange={event => { void save(event.target.value) }}>
        {choices.map((value, index) => <option key={value} value={value}>{t(labels[index]!)}</option>)}
      </select>
    </label>
    <p className={css.note}>{t(hint)}</p>
    {view?.note && <p className={css.note}>{t(view.note)}</p>}
    {view && !view.writable && <p className={css.note}>{t('codexVerbosityReadOnly')}</p>}
    {error && <p className={css.error} role="alert">{error}</p>}
    {(reading || pending || saved) && <div className={css.actions}>
      {(reading || pending) ? <span className={css.note} role="status">{t(pending ? 'providerWorking' : 'providerChecking')}</span>
        : <span className={css.saveSuccessMsg} role="status">{t(savedLabel)}</span>}
    </div>}
  </div>
}
