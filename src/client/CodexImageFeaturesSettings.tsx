/** User-only switches for Codex subscription image-generation and editing tools. */
import { useEffect, useRef, useState } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProviderPanelKey } from './locales.ts'
import css from './ProviderSettings.module.css'
export interface CodexImageFeaturesProps { rpc: ClientConnectionRpc; subscribe?: (listener: () => void) => () => void; t: Translate<ProviderPanelKey> }
export interface CodexImageFeatures { imageGeneration: boolean; imageEditing: boolean; writable: boolean }
export type CodexImageFeaturePatch = Partial<Pick<CodexImageFeatures, 'imageGeneration' | 'imageEditing'>>
export async function requestCodexImageFeatures(rpc: ClientConnectionRpc, patch?: CodexImageFeaturePatch, signal?: AbortSignal): Promise<CodexImageFeatures> {
  if (patch && (!Object.keys(patch).length || Object.keys(patch).some(key => !['imageGeneration', 'imageEditing'].includes(key)) || Object.values(patch).some(value => typeof value !== 'boolean'))) throw Error('Invalid Codex image settings')
  const response = await rpc.call('/api', patch ? 'codex-subscription/preferences/update' : 'codex-subscription/preferences/status', patch ?? {}, signal)
  if (!response.ok) throw Error(response.error.message)
  const value = response.value as { imageGeneration?: unknown; imageEditing?: unknown; imageFeaturesWritable?: unknown; writable?: unknown } | null
  const writable = value?.imageFeaturesWritable ?? value?.writable
  if (!value || typeof value.imageGeneration !== 'boolean' || typeof value.imageEditing !== 'boolean' || typeof writable !== 'boolean') throw Error('Invalid Codex image settings response')
  if (patch && Object.entries(patch).some(([key, enabled]) => value[key as keyof typeof value] !== enabled)) throw Error('DSH did not accept the Codex image setting update')
  return { imageGeneration: value.imageGeneration, imageEditing: value.imageEditing, writable }
}
const controls = [
  { key: 'imageGeneration', label: 'codexImageGeneration', hint: 'codexImageGenerationHint' },
  { key: 'imageEditing', label: 'codexImageEditing', hint: 'codexImageEditingHint' },
] as const
export function CodexImageFeaturesSettings({ rpc, subscribe, t }: CodexImageFeaturesProps) {
  const [view, setView] = useState<CodexImageFeatures | null>(null)
  const [revision, setRevision] = useState(0), [reading, setReading] = useState(true), [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false), [error, setError] = useState<string | null>(null)
  const saving = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => subscribe?.(() => setRevision(value => value + 1)), [subscribe])
  useEffect(() => {
    const abort = new AbortController(); setReading(true)
    void requestCodexImageFeatures(rpc, undefined, abort.signal).then(value => {
      if (!abort.signal.aborted) { setView(value); setError(null) }
    }).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!abort.signal.aborted) setReading(false) })
    return () => { abort.abort() }
  }, [rpc, revision])
  const save = async (key: typeof controls[number]['key'], enabled: boolean) => {
    if (!view || !view.writable || saving.current || view[key] === enabled) return
    saving.current = true; setPending(true); setSaved(false); setError(null)
    try {
      const next = await requestCodexImageFeatures(rpc, { [key]: enabled })
      if (mounted.current) { setView(next); setSaved(true) }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { saving.current = false; if (mounted.current) setPending(false) }
  }
  const disabled = reading || pending || !view?.writable
  return <div className={`${css.fieldGroup} ${css.verbositySetting} ${css.imageFeatureSetting}`}>
    <h3>{t('codexImageFeatures')}</h3>
    <p className={css.note}>{t('codexImageFeaturesHint')}</p>
    {controls.map(({ key, label, hint }) => <div key={key} className={css.imageFeatureRow}>
      <div><span className={css.imageFeatureLabel}>{t(label)}</span><p className={css.note}>{t(hint)}</p></div>
      <label className={css.switch}>
        <input type="checkbox" role="switch" aria-label={t(label)} aria-checked={view?.[key] ?? false} checked={view?.[key] ?? false} disabled={disabled}
          onChange={event => { void save(key, event.target.checked) }} />
        <span className={css.switchSlider} />
      </label>
    </div>)}
    {view && !view.writable && <p className={css.note}>{t('codexVerbosityReadOnly')}</p>}
    {error && <p className={css.error} role="alert">{error}</p>}
    {(reading || pending || saved) && <p className={saved && !reading && !pending ? css.saveSuccessMsg : css.note} role="status">{t(reading ? 'providerChecking' : pending ? 'providerWorking' : 'codexImageFeaturesSaved')}</p>}
  </div>
}
