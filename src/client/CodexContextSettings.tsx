/** One shared custom capacity in k (1,000 tokens). */
import { useEffect, useId, useRef, useState } from 'react'
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx'
import type { ContextMode } from '../codex/context-length.ts'
import { SettingsDropdown } from './SettingsDropdown.tsx'
import css from './ProviderSettings.module.css'
export interface ContextView { contextMode: ContextMode; contextLengthK: number; contextMaximumK: number; writable: boolean }
export interface ContextPatch { contextMode?: ContextMode; contextLengthK?: number }
const modes = ['standard', 'extended', 'custom'] as const
const modeLabels = ['codexContextStandard', 'codexContextExtended', 'codexContextCustom'] as const
const validK = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 128 && (value as number) <= 16000
export async function requestCodexContext(rpc: CodexVerbosityProps['rpc'], patch?: ContextPatch, signal?: AbortSignal): Promise<ContextView> {
  if (patch?.contextMode !== undefined && !modes.includes(patch.contextMode) || patch?.contextLengthK !== undefined && !validK(patch.contextLengthK)) throw Error('Invalid Codex context settings')
  const response = await rpc.call('/api', patch ? 'codex-subscription/preferences/update' : 'codex-subscription/preferences/status', patch ?? {}, signal)
  if (!response.ok) throw Error(response.error.message)
  const raw = response.value as Partial<ContextView> & { contextWritable?: boolean } | null
  if (!raw || !modes.includes(raw.contextMode as ContextMode) || typeof raw.contextWritable !== 'boolean' || !validK(raw.contextLengthK) || !validK(raw.contextMaximumK) || raw.contextLengthK > raw.contextMaximumK) throw Error('Invalid Codex context settings response')
  if (patch?.contextMode !== undefined && raw.contextMode !== patch.contextMode || patch?.contextLengthK !== undefined && raw.contextLengthK !== patch.contextLengthK) throw Error('DSH did not accept the Codex context length update')
  return { contextMode: raw.contextMode as ContextMode, contextLengthK: raw.contextLengthK, contextMaximumK: raw.contextMaximumK, writable: raw.contextWritable }
}
export function CodexContextSettings({ rpc, subscribe, t }: CodexVerbosityProps) {
  const inputId = useId()
  const [view, setView] = useState<ContextView | null>(null), [draft, setDraft] = useState('256')
  const [revision, setRevision] = useState(0), [reading, setReading] = useState(true), [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false), [error, setError] = useState<string | null>(null)
  const saving = useRef(false), mounted = useRef(true), acknowledged = useRef<ContextView | null>(null)
  const accept = (next: ContextView, preserveDraft = false) => {
    const old = acknowledged.current
    setDraft(previous => preserveDraft && old && previous !== String(old.contextLengthK) ? previous : String(next.contextLengthK))
    acknowledged.current = next; setView(next)
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => subscribe?.(() => setRevision(n => n + 1)), [subscribe])
  useEffect(() => {
    if (saving.current) return
    const abort = new AbortController()
    setReading(true)
    void requestCodexContext(rpc, undefined, abort.signal).then(next => {
      if (!abort.signal.aborted) { accept(next, true); setError(null); setSaved(false) }
    }).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!abort.signal.aborted) setReading(false) })
    return () => { abort.abort() }
  }, [rpc, revision])
  const save = async (patch: ContextPatch) => {
    if (saving.current || reading || !view?.writable) return
    saving.current = true; setPending(true); setSaved(false); setError(null)
    try {
      const next = await requestCodexContext(rpc, patch)
      if (mounted.current) { accept(next, patch.contextLengthK === undefined); setSaved(true) }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { saving.current = false; if (mounted.current) setPending(false) }
  }
  const size = Number(draft), invalid = !/^\d+$/.test(draft) || !validK(size) || size > (view?.contextMaximumK ?? 16000)
  const disabled = reading || pending || !view?.writable
  return <div className={`${css.fieldGroup} ${css.verbositySetting} ${css.contextSetting}`}>
    <div className={css.fieldLabel}><span>{t('codexContext')}</span>
      <SettingsDropdown label={t('codexContext')} value={view?.contextMode ?? 'standard'} choices={modes} labels={modeLabels.map(key => t(key))}
        disabled={disabled} onChange={value => { if (value !== view?.contextMode) void save({ contextMode: value as ContextMode }) }} />
    </div>
    <p className={css.note}>{t('codexContextHint')}</p>
    {view?.contextMode === 'custom' && <p className={css.note}>{t('codexContextEffective', { size: view.contextLengthK })}</p>}
    {view?.contextMode === 'custom' && <>
      <div className={css.fieldLabel}><label htmlFor={inputId}>{t('codexContextSize')}</label>
        <div className={css.contextInputGroup}>
          <span className={css.contextInput}><input id={inputId} aria-label={t('codexContextSize')} type="number" min={128} max={view.contextMaximumK} step="1" value={draft} disabled={disabled}
            onChange={event => { setDraft(event.target.value); setSaved(false) }} /><span aria-hidden="true">k</span></span>
          <button type="button" className={css.action} disabled={disabled || invalid || size === view.contextLengthK} onClick={() => { void save({ contextMode: 'custom', contextLengthK: size }) }}>{t('codexContextSave')}</button>
        </div>
      </div>
      {invalid && <p className={css.error}>{t('codexContextInvalid', { maximum: view.contextMaximumK })}</p>}
    </>}
    {view && !view.writable && <p className={css.note}>{t('codexVerbosityReadOnly')}</p>}
    {error && <p className={css.error} role="alert">{error}</p>}
    {(reading || pending || saved) && <p className={saved && !reading && !pending ? css.saveSuccessMsg : css.note} role="status">{t(reading ? 'providerChecking' : pending ? 'providerWorking' : 'codexContextSaved')}</p>}
  </div>
}
