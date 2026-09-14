/** Model and reasoning-effort seat; context selection is explicitly unsupported. */

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
  hooks: {
    /** Session model directory bound by the renderer as useDirectory. */
    directory: SnapshotStore<ModelDirectoryState>
  }
  /** Load the session's shared model directory. */
  loadDirectory: () => Promise<void>
  /** Submit one complete selection through the shared directory. */
  select: (selection: ModelSelection) => Promise<void>
}

/** Complete conversation-seat props. */
export type ModelPanelProps =
  PropsRuntime<'conversation.input.right'>
  & PropsLocale<'modelPanel'>
  & InjectFace<ModelPanelInjected>

/** Render the model seat and its combined panel. */
export function ModelPanel({ useDirectory, loadDirectory, select, t }: ModelPanelProps): ReactNode {
  const directory = useDirectory(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ kind: 'loadFailed' | 'selectFailed'; message: string } | null>(null)
  const [dragging, setDragging] = useState<{ model: ModelPanelModel; provider: string; index: number } | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)
  const selecting = useRef(false)

  // Invalidate late completions on teardown or a new injected session directory.
  useEffect(() => {
    mounted.current = true
    generation.current++
    selecting.current = false
    setBusy(false)
    setLoading(false)
    setError(null)
    setDragging(null)
    return () => { mounted.current = false; generation.current++ }
  }, [useDirectory, loadDirectory, select])

  const group = activeGroup(directory)
  const models = group?.models ?? []
  const currentModel = group === undefined ? undefined
    : models.find(model => isCurrentModel(directory.current, group.id, model))
  const efforts = currentModel?.reasoning?.efforts ?? []
  const currentEffort = directory.current?.reasoningEffort
  const currentEffortName = efforts.find(effort => effort.id === currentEffort)?.name
  const pending = busy || directory.status === 'selecting'
  const fetching = loading || directory.status === 'loading'

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
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
    // Promise.resolve also turns a synchronous adapter throw into the same error path.
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

  const triggerLabel = currentModel?.name ?? directory.current?.model ?? t('trigger')

  return (
    <div
      className={css.root}
      data-testid="dshx-model-panel"
      ref={root}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={css.trigger}
        aria-label={t('title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) reload()
        }}
      >
        <span className={css.dot} aria-hidden="true" style={{ background: accentFor(currentModel?.id ?? '', 0) }} />
        <span className={css.triggerLabel}>{triggerLabel}</span>
        {currentEffortName === undefined ? null : <span className={css.triggerEffort}>{currentEffortName}</span>}
        <span aria-hidden="true"><IconChevronDownOutline14 className={css.chevron} /></span>
      </button>
      {open && (
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
          {directory.current !== null && currentModel === undefined && !fetching
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
