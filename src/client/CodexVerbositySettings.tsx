/** One Codex-wide preference, shared by quick and full Settings views. */
import { useEffect, useRef, useState } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { OutputVerbosity } from '../codex/output-verbosity.ts'
import type { ProviderPanelKey } from './locales.ts'
import css from './ProviderSettings.module.css'

export interface CodexVerbosityProps {
  rpc: ClientConnectionRpc
  subscribe?: (listener: () => void) => () => void
  t: Translate<ProviderPanelKey>
}
export interface CodexVerbosityView { outputVerbosity: OutputVerbosity; writable: boolean }
const choices = ['default', 'low', 'medium', 'high'] as const
const labels = ['codexVerbosityDefault', 'codexVerbosityLow', 'codexVerbosityMedium', 'codexVerbosityHigh'] as const
export async function requestCodexVerbosity(rpc: ClientConnectionRpc, value?: OutputVerbosity, signal?: AbortSignal): Promise<CodexVerbosityView> {
  if (value !== undefined && !choices.includes(value)) throw Error('Invalid output verbosity preference')
  const response = await rpc.call('/api', value === undefined ? 'codex-subscription/preferences/status' : 'codex-subscription/preferences/update', value === undefined ? {} : { outputVerbosity: value }, signal)
  if (!response.ok) throw Error(response.error.message)
  const result = response.value as { outputVerbosity?: unknown; outputVerbosityWritable?: unknown; writable?: unknown } | null
  const writable = result?.outputVerbosityWritable ?? result?.writable
  if (!choices.includes(result?.outputVerbosity as OutputVerbosity) || typeof writable !== 'boolean') throw Error('Invalid Codex response detail response')
  if (value !== undefined && result?.outputVerbosity !== value) throw Error('DSH did not accept the Codex response detail update')
  return { outputVerbosity: result!.outputVerbosity as OutputVerbosity, writable }
}

export function CodexVerbositySettings({ rpc, subscribe, t }: CodexVerbosityProps) {
  const [view, setView] = useState<CodexVerbosityView | null>(null)
  const [revision, setRevision] = useState(0)
  const [reading, setReading] = useState(true)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => subscribe?.(() => setRevision(value => value + 1)), [subscribe])
  useEffect(() => {
    const abort = new AbortController()
    setReading(true)
    void requestCodexVerbosity(rpc, undefined, abort.signal).then(value => {
      if (!abort.signal.aborted) { setView(value); setError(null) }
    }).catch(error => {
      if (!abort.signal.aborted) setError(error instanceof Error ? error.message : String(error))
    }).finally(() => { if (!abort.signal.aborted) setReading(false) })
    return () => { abort.abort() }
  }, [rpc, revision])
  const save = async (value: OutputVerbosity) => {
    if (saving.current || !view?.writable || value === view.outputVerbosity) return
    saving.current = true; setPending(true); setSaved(false); setError(null)
    try {
      const result = await requestCodexVerbosity(rpc, value)
      if (mounted.current) { setView(result); setSaved(true) }
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : String(error))
    } finally { saving.current = false; if (mounted.current) setPending(false) }
  }
  return <div className={`${css.fieldGroup} ${css.verbositySetting}`}>
    <label className={css.fieldLabel}>
      {t('codexVerbosity')}
      <select aria-label={t('codexVerbosity')} value={view?.outputVerbosity ?? 'default'} disabled={reading || pending || !view?.writable}
        onChange={event => { void save(event.target.value as OutputVerbosity) }}>
        {choices.map((value, index) => <option key={value} value={value}>{t(labels[index]!)}</option>)}
      </select>
    </label>
    <p className={css.note}>{t('codexVerbosityHint')}</p>
    {view && !view.writable && <p className={css.note}>{t('codexVerbosityReadOnly')}</p>}
    {error && <p className={css.error} role="alert">{error}</p>}
    {(reading || pending || saved) && <div className={css.actions}>
      {(reading || pending) ? <span className={css.note} role="status">{t(pending ? 'providerWorking' : 'providerChecking')}</span>
        : <span className={css.saveSuccessMsg} role="status">{t('codexVerbositySaved')}</span>}
    </div>}
  </div>
}
