/** Provider and model/reasoning controls that replace the shipped model seat. */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  accentFor, activeGroup, effortIndex, isCurrentModel, restingEffort,
  selectionForRow, type ModelPanelModel,
} from './selection.ts'
import css from './ModelPanel.module.css'

/** Per-session injected seat dependencies. */
export interface ModelPanelInjected {
  /** Addressed subagent sessions cannot use Agent-bound model selection. */
  available: boolean
  hooks: {
    /** Session model directory bound by the renderer as useDirectory. */
    directory: SnapshotStore<ModelDirectoryState>
  }
  /** Load the session's shared model directory. */
  loadDirectory: () => Promise<void>
  /** Submit one complete selection through the shared directory. */
  select: (selection: ModelSelection) => Promise<void>
}

/** Complete replacement-seat props, including the composer's lock state. */
export type ModelPanelProps =
  PropsRuntime<'conversation.input.model'>
  & PropsLocale<'modelPanel'>
  & InjectFace<ModelPanelInjected>

type OpenPane = 'provider' | 'model' | null

/** Render separate provider and model controls inside the official model seat. */
export function ModelPanel({ locked, available, useDirectory, loadDirectory, select, t }: ModelPanelProps): ReactNode {
  const directory = useDirectory(snapshot => snapshot)
  const [open, setOpen] = useState<OpenPane>(null)
  const [providerDraft, setProviderDraft] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ kind: 'loadFailed' | 'selectFailed'; message: string } | null>(null)
  const [dragging, setDragging] = useState<{ model: ModelPanelModel; provider: string; index: number } | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const providerTrigger = useRef<HTMLButtonElement | null>(null)
  const modelTrigger = useRef<HTMLButtonElement | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)
  const selecting = useRef(false)

  // Invalidate late completions and local navigation when the injected Session changes.
  useEffect(() => {
    mounted.current = true
    generation.current++
    selecting.current = false
    setOpen(null)
    setProviderDraft(undefined)
    setBusy(false)
    setLoading(false)
    setError(null)
    setDragging(null)
    return () => { mounted.current = false; generation.current++ }
  }, [useDirectory, loadDirectory, select])

  // Follow authoritative provider changes, but preserve a provider the user is browsing
  // until a model selection changes the authoritative route.
  useEffect(() => {
    if (directory.current?.provider !== undefined) setProviderDraft(directory.current.provider)
  }, [directory.current?.provider])

  const authoritativeGroup = activeGroup(directory)
  const group = directory.groups.find(candidate => candidate.id === providerDraft) ?? authoritativeGroup
  const models = group?.models ?? []
  const currentModel = group === undefined || group.id !== directory.current?.provider ? undefined
    : models.find(model => isCurrentModel(directory.current, group.id, model))
  const efforts = currentModel?.reasoning?.efforts ?? []
  const currentEffort = currentModel === undefined ? undefined : directory.current?.reasoningEffort
  const currentEffortName = efforts.find(effort => effort.id === currentEffort)?.name
  const pending = locked || busy || directory.status === 'selecting'
  const fetching = loading || directory.status === 'loading'

  useEffect(() => {
    if (open === null) return
    const close = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(null)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      const focus = open === 'provider' ? providerTrigger.current : modelTrigger.current
      setOpen(null)
      focus?.focus()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const run = (kind: 'loadFailed' | 'selectFailed', operation: () => Promise<void>): void => {
    const request = ++generation.current
    const isSelection = kind === 'selectFailed'
    selecting.current = isSelection
    setBusy(isSelection)
    setLoading(!isSelection)
    setError(null)
    void Promise.resolve().then(operation)
      .catch((cause: unknown) => {
        if (!mounted.current || request !== generation.current) return
        setError({ kind, message: cause instanceof Error ? cause.message : String(cause) })
      })
      .finally(() => {
        if (!mounted.current || request !== generation.current) return
        selecting.current = false
        setBusy(false)
        setLoading(false)
        setDragging(null)
      })
  }

  const reload = (): void => {
    if (selecting.current || pending) return
    run('loadFailed', loadDirectory)
  }

  const toggle = (pane: Exclude<OpenPane, null>): void => {
    if (pending) return
    const next = open === pane ? null : pane
    setOpen(next)
    if (next !== null) reload()
  }

  const submit = (model: ModelPanelModel | undefined, effortId: string | undefined): void => {
    if (group === undefined || model === undefined || selecting.current || pending) return
    run('selectFailed', () => select(selectionForRow(model, group.id, effortId)))
  }

  const renderRow = (model: ModelPanelModel, index: number): ReactNode => {
    const ladder = model.reasoning?.efforts ?? []
    const count = ladder.length
    const provider = group!.id
    const isCurrent = isCurrentModel(directory.current, provider, model)
    const restingId = isCurrent ? currentEffort : restingEffort(model)
    const resting = effortIndex(model, restingId)
    const position = dragging?.model === model && dragging.provider === provider ? dragging.index : resting
    const ratio = count > 1 && position >= 0 ? position / (count - 1) : 0
    const effortName = ladder[position]?.name ?? (restingId === undefined
      ? t('defaultEffort') : t('unknownEffort', { effort: restingId }))
    const accent = accentFor(model.id, index)
    return (
      <div
        key={`${provider}/${model.id}`}
        className={isCurrent ? `${css.row} ${css.rowCurrent}` : css.row}
        data-model-accent={model.id}
        data-current={isCurrent}
        style={{
          '--dshx-accent': accent,
          '--dshx-accent-soft': `${accent}1f`,
          '--dshx-accent-edge': `${accent}66`,
        } as CSSProperties}
      >
        <div className={css.rowHead}>
          <button
            type="button"
            className={css.rowName}
            aria-label={t('selectModel', { model: model.name })}
            aria-pressed={isCurrent}
            disabled={pending}
            onClick={() => { submit(model, restingId) }}
          >{model.name}</button>
          <span className={css.rowValue}>{count === 0 ? t('noEffortShort') : effortName}</span>
        </div>
        {count === 0 ? null : (
          <div className={css.track}>
            <span className={css.rail} aria-hidden="true" />
            {ladder.map((effort, stop) => (
              <span
                key={effort.id}
                className={css.stop}
                aria-hidden="true"
                style={{ left: `calc(10px + (100% - 20px) * ${count > 1 ? stop / (count - 1) : 0})` }}
              />
            ))}
            {position < 0 ? null : <>
              <span className={css.fill} aria-hidden="true" style={{ width: `calc((100% - 20px) * ${ratio})` }} />
              <span className={css.thumb} aria-hidden="true" style={{ left: `calc(10px + (100% - 20px) * ${ratio})` }} />
            </>}
            <input
              className={css.input}
              type="range"
              min={resting < 0 ? -1 : 0}
              max={count - 1}
              step={1}
              value={position}
              disabled={pending}
              aria-label={t('adjustEffort', { model: model.name })}
              aria-valuetext={effortName}
              onChange={(event) => {
                if (selecting.current || pending) return
                const next = Number(event.target.value)
                const effort = ladder[next]
                if (effort === undefined) return
                setDragging({ model, provider, index: next })
                submit(model, effort.id)
              }}
              onPointerUp={() => { setDragging(null) }}
              onKeyUp={() => { setDragging(null) }}
              onBlur={() => { setDragging(null) }}
            />
          </div>
        )}
      </div>
    )
  }

  if (!available) return null

  const providerLabel = group?.name ?? directory.current?.provider ?? t('providerTrigger')
  const modelLabel = currentModel?.name ?? (group?.id === directory.current?.provider
    ? directory.current?.model ?? t('trigger') : t('trigger'))

  return (
    <div
      className={css.root}
      data-testid="dsh-model-panel"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || open === null) return
        event.preventDefault()
        const focus = open === 'provider' ? providerTrigger.current : modelTrigger.current
        setOpen(null)
        focus?.focus()
      }}
      ref={root}
    >
      <button
        ref={providerTrigger}
        type="button"
        className={`${css.trigger} ${css.providerTrigger}`}
        aria-label={t('providerTitle')}
        aria-haspopup="dialog"
        aria-expanded={open === 'provider'}
        disabled={pending}
        title={providerLabel}
        onClick={() => { toggle('provider') }}
      >
        <span className={css.providerLabel}>{providerLabel}</span>
        <span aria-hidden="true"><IconChevronDownOutline14 className={css.chevron} /></span>
      </button>

      <button
        ref={modelTrigger}
        type="button"
        className={`${css.trigger} ${css.modelTrigger}`}
        aria-label={t('title')}
        aria-haspopup="dialog"
        aria-expanded={open === 'model'}
        disabled={pending}
        title={currentEffortName === undefined ? modelLabel : `${modelLabel} · ${currentEffortName}`}
        onClick={() => { toggle('model') }}
      >
        <span className={css.dot} aria-hidden="true" style={{ background: accentFor(currentModel?.id ?? modelLabel, 0) }} />
        <span className={css.triggerLabel}>{modelLabel}</span>
        {currentEffortName === undefined ? null : <span className={css.triggerEffort}>{currentEffortName}</span>}
        <span aria-hidden="true"><IconChevronDownOutline14 className={css.chevron} /></span>
      </button>

      {open === 'provider' && (
        <div className={`${css.menu} ${css.providerMenu}`} role="dialog" aria-label={t('providerTitle')} aria-busy={fetching}>
          <div className={css.head}>
            <span className={css.headTitle}>{t('providerTitle')}</span>
            <button type="button" className={css.reload} disabled={pending || fetching} onClick={reload}>{t('reload')}</button>
          </div>
          {error?.kind === 'loadFailed' ? <p className={css.error} role="alert">{t('loadFailed', { message: error.message })}</p> : null}
          {fetching ? <p className={css.note} role="status">{t('loading')}</p> : null}
          {directory.groups.length === 0 && !fetching ? <p className={css.note}>{t('providerEmpty')}</p> : null}
          <div className={css.providerList} role="listbox" aria-label={t('providerTitle')}>
            {directory.groups.map(candidate => (
              <button
                key={candidate.id}
                type="button"
                role="option"
                aria-selected={candidate.id === group?.id}
                className={candidate.id === group?.id ? `${css.providerOption} ${css.providerCurrent}` : css.providerOption}
                disabled={pending}
                onClick={() => {
                  setProviderDraft(candidate.id)
                  setOpen(null)
                  queueMicrotask(() => { providerTrigger.current?.focus() })
                }}
              >
                <span>{candidate.name}</span>
                <span className={css.providerCount}>{candidate.models.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {open === 'model' && (
        <div className={css.menu} role="dialog" aria-label={t('title')} aria-busy={pending || fetching}>
          <div className={css.head}>
            <span className={css.headTitle}>{group?.name ?? t('title')}</span>
            <button type="button" className={css.reload} disabled={pending || fetching} onClick={reload}>{t('reload')}</button>
          </div>
          {error !== null
            ? <p className={css.error} role="alert">{t(error.kind, { message: error.message })}</p>
            : directory.error === null ? null : <p className={css.error} role="alert">{directory.error}</p>}
          {directory.failures.map(failure => (
            <p key={failure.id} className={css.error} role="alert">{t('providerFailed', { provider: failure.name, message: failure.message })}</p>
          ))}
          {fetching ? <p className={css.note} role="status">{t('loading')}</p> : null}
          {directory.current !== null && group?.id === directory.current.provider && currentModel === undefined && !fetching
            ? <p className={css.note}>{t('missing', { provider: directory.current.provider, model: directory.current.model })}</p> : null}
          {models.length === 0 && !fetching ? <p className={css.note}>{t('empty')}</p> : null}
          {models.length === 0 ? null : <>
            {currentModel === undefined ? null : efforts.length === 0
              ? <p className={css.note}>{t('noEffort')}</p>
              : (
                <div className={css.pills} role="group" aria-label={t('effort')}>
                  {efforts.map(effort => (
                    <button
                      key={effort.id}
                      type="button"
                      className={css.pill}
                      aria-pressed={effort.id === currentEffort}
                      disabled={pending}
                      onClick={() => { submit(currentModel, effort.id) }}
                    >{effort.name}</button>
                  ))}
                </div>
              )}
            <div className={css.rows}>{models.map(renderRow)}</div>
          </>}
          <div className={css.foot}>
            <span className={css.footLabel}>{t('contextWindow')}</span>
            <span className={css.note}>{t('contextUnsupported')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
