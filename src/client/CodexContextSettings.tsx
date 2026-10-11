/** Profile-wide Codex context capacity; host model metadata supplies every limit. */
import { useEffect, useRef, useState } from 'react'
import type { CodexVerbosityProps } from './CodexVerbositySettings.tsx'
import type { ContextMode } from '../codex/context-length.ts'
import css from './ProviderSettings.module.css'
export interface ContextModel { key: string; label: string; minimum: number; maximum: number; default: number; effective: number; fixed: boolean }
export interface ContextView { contextMode: ContextMode; customContextModels: Record<string, number>; contextModels: ContextModel[]; writable: boolean }
export interface ContextPatch { contextMode?: ContextMode; customContextModels?: Record<string, number> }
const modes = ['standard', 'extended', 'custom'] as const
const modeLabels = ['codexContextStandard', 'codexContextExtended', 'codexContextCustom'] as const
const positive = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0 && (n as number) <= 16000000
export async function requestCodexContext(rpc: CodexVerbosityProps['rpc'], patch?: ContextPatch, signal?: AbortSignal): Promise<ContextView> {
  const response = await rpc.call('/api', patch ? 'codex-subscription/preferences/update' : 'codex-subscription/preferences/status', patch ?? {}, signal)
  if (!response.ok) throw Error(response.error.message)
  const raw = response.value as Partial<ContextView> & { contextWritable?: boolean } | null
  if (!raw || !modes.includes(raw.contextMode as ContextMode) || typeof raw.contextWritable !== 'boolean' || !raw.customContextModels || typeof raw.customContextModels !== 'object' || Array.isArray(raw.customContextModels) || !Array.isArray(raw.contextModels)) throw Error('Invalid Codex context settings response')
  if (Object.keys(raw.customContextModels).length > 64 || Object.entries(raw.customContextModels).some(([key, n]) => !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,95}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key) || !positive(n))) throw Error('Invalid Codex context settings response')
  const keys = new Set<string>()
  for (const model of raw.contextModels) {
    if (!model || typeof model.key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,95}$/.test(model.key) || ['constructor', 'prototype', '__proto__'].includes(model.key) || keys.has(model.key) || typeof model.label !== 'string' || typeof model.fixed !== 'boolean' || ![model.minimum, model.maximum, model.default, model.effective].every(positive) || model.minimum > model.maximum || model.default > model.maximum || model.effective > model.maximum) throw Error('Invalid Codex context model response')
    keys.add(model.key)
  }
  if (patch?.contextMode !== undefined && raw.contextMode !== patch.contextMode || Object.entries(patch?.customContextModels ?? {}).some(([key, size]) => raw.customContextModels![key] !== size)) throw Error('DSH did not accept the Codex context length update')
  return { contextMode: raw.contextMode as ContextMode, customContextModels: { ...raw.customContextModels }, contextModels: raw.contextModels, writable: raw.contextWritable }
}
export function CodexContextSettings({ rpc, subscribe, t }: CodexVerbosityProps) {
  const [view, setView] = useState<ContextView | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const [reading, setReading] = useState(true)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false), mounted = useRef(true), acknowledged = useRef<ContextView | null>(null)
  const accept = (next: ContextView, preserveDraft = false) => {
    const old = acknowledged.current
    setDraft(previous => Object.fromEntries(next.contextModels.filter(model => !model.fixed).map(model => {
      const baseline = old?.customContextModels[model.key] ?? old?.contextModels.find(group => group.key === model.key)?.default
      const dirty = preserveDraft && baseline !== undefined && previous[model.key] !== undefined && previous[model.key] !== String(baseline)
      return [model.key, dirty ? previous[model.key]! : String(next.customContextModels[model.key] ?? model.default)]
    })))
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
      if (mounted.current) { accept(next); setSaved(true) }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally { saving.current = false; if (mounted.current) setPending(false) }
  }
  const custom: Record<string, number> = {}
  let invalid = false
  for (const model of view?.contextModels ?? []) {
    if (model.fixed) continue
    const size = Number(draft[model.key])
    if (!positive(size) || size < model.minimum || size > model.maximum) invalid = true
    if (size !== (view?.customContextModels[model.key] ?? model.default)) custom[model.key] = size
  }
  const disabled = reading || pending || !view?.writable
  return <div className={`${css.fieldGroup} ${css.verbositySetting} ${css.contextSetting}`}>
    <label className={css.fieldLabel}>{t('codexContext')}
      <select aria-label={t('codexContext')} value={view?.contextMode ?? 'standard'} disabled={disabled}
        onChange={event => { const mode = event.target.value as ContextMode; if (mode !== view?.contextMode) void save({ contextMode: mode }) }}>
        {modes.map((mode, i) => <option key={mode} value={mode}>{t(modeLabels[i]!)}</option>)}
      </select>
    </label>
    <p className={css.note}>{t('codexContextHint')}</p>
    {view && <div className={css.contextRows}>
      {view.contextModels.length === 0 && <p className={css.note}>{t('codexContextNoModels')}</p>}
      {view.contextModels.map(model => <div key={model.key}>
        <label className={css.fieldLabel}>
          <span>{model.label}{model.fixed ? ` · ${t('codexContextFixed')}` : ''}</span>
          {view.contextMode === 'custom' && !model.fixed ? <input type="number" aria-label={model.label} min={model.minimum} max={model.maximum} step="1" value={draft[model.key] ?? ''} disabled={disabled}
            onChange={event => { setDraft(previous => ({ ...previous, [model.key]: event.target.value })); setSaved(false) }} /> : <span>{model.effective.toLocaleString()} tokens</span>}
        </label>
        <p className={css.note}>{t('codexContextRange', { minimum: model.minimum.toLocaleString(), maximum: model.maximum.toLocaleString(), standard: model.default.toLocaleString() })}</p>
      </div>)}
    </div>}
    {view?.contextMode === 'custom' && <div className={css.actions}>
      <button type="button" className={css.action} disabled={disabled || invalid || Object.keys(custom).length === 0} onClick={() => { void save({ contextMode: 'custom', customContextModels: custom }) }}>{t('codexContextSave')}</button>
      {invalid && <span className={css.error}>{t('codexContextInvalid')}</span>}
    </div>}
    {view && !view.writable && <p className={css.note}>{t('codexVerbosityReadOnly')}</p>}
    {error && <p className={css.error} role="alert">{error}</p>}
    {(reading || pending || saved) && <p className={saved && !reading && !pending ? css.saveSuccessMsg : css.note} role="status">{t(reading ? 'providerChecking' : pending ? 'providerWorking' : 'codexContextSaved')}</p>}
  </div>
}
