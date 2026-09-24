/** Provider and model/reasoning controls that replace the shipped model seat. */

import {
  useEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { isCodexProvider, maskedEmail, type CodexAccountsState } from './providers/codex.ts'
import { isAntigravityProvider, type AntigravityState } from './providers/antigravity.ts'
import {
  accentFor, activeGroup, effortIndex, isCurrentModel, resolveModelEffort, restingEffort,
  selectionForRow, type ProviderPanelModel, loadDisabledModels, getDisabledModelsForAccount, MODELS_VISIBILITY_EVENT,
} from './selection.ts'
import css from './ProviderPanel.module.css'

/** Per-session injected seat dependencies. */
export interface ProviderPanelInjected {
  /** Addressed subagent sessions cannot use Agent-bound model selection. */
  available: boolean
  hooks: {
    /** Session model directory bound by the renderer as useDirectory. */
    directory: SnapshotStore<ModelDirectoryState>
    /** Secret-free Codex account roster from the installed subscription plugin. */
    accounts: SnapshotStore<CodexAccountsState>
    /** Antigravity controller store with accounts and quota. */
    antigravity?: SnapshotStore<AntigravityState>
  }
  /** Load the session's shared model directory. */
  loadDirectory: () => Promise<void>
  /** Load the optional Codex subscription account roster. */
  loadAccounts: () => Promise<void>
  /** Select the real active Codex account used for subsequent quota and requests. */
  selectAccount: (id: string) => Promise<void>
  /** Read one account's quota, reverting the temporary switch when it is not active. */
  readQuota: (id: string) => Promise<void>
  /** Submit one complete selection through the shared directory. */
  select: (selection: ModelSelection) => Promise<void>
  /** Load Antigravity state & accounts. */
  loadAntigravity?: () => Promise<void>
  /** Select active Antigravity account. */
  selectAntigravityAccount?: (id: string) => Promise<void>
  /** Read Antigravity quota for specific or active account. */
  readAntigravityQuota?: (id?: string) => Promise<void>
}

/** Complete replacement-seat props, including the composer's lock state. */
export type ProviderPanelProps =
  PropsRuntime<'conversation.input.model'>
  & PropsLocale<'providerExtension'>
  & InjectFace<ProviderPanelInjected>

type OpenPane = 'provider' | 'model' | null

type SliderDrag = {
  model: ProviderPanelModel
  provider: string
  index: number
  source: 'pointer' | 'keyboard'
  pointerId?: number
}

const EFFORT_STORAGE_KEY = 'dsh-provider-extension:model-efforts'

function loadEffortMemory(): Record<string, string> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(EFFORT_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, string>
        }
      }
    }
  } catch {}
  return {}
}

function saveEffortMemory(memory: Record<string, string>): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(EFFORT_STORAGE_KEY, JSON.stringify(memory))
    }
  } catch {}
}

/** Convert one horizontal pointer coordinate into a discrete effort index. */
export function sliderIndexFromPoint(clientX: number, rect: { left: number; width: number }, count: number): number {
  if (count <= 0) return -1
  if (count === 1) return 0
  const usable = Math.max(1, rect.width - 20)
  const ratio = Math.min(1, Math.max(0, (clientX - (rect.left + 10)) / usable))
  return Math.round(ratio * (count - 1))
}

function formatRemaining(isoTime?: string, pct?: number): string {
  if (!isoTime) {
    if (pct === 100) return '满额可用'
    return '计算中…'
  }
  try {
    const diffMs = new Date(isoTime).getTime() - Date.now()
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

/** Render separate provider and model controls inside the official model seat. */
export function ProviderPanel({
  locked, available, useDirectory, useAccounts, useAntigravity,
  loadDirectory, loadAccounts, selectAccount, readQuota, select,
  loadAntigravity, selectAntigravityAccount, readAntigravityQuota, t,
}: ProviderPanelProps): ReactNode {
  const directory = useDirectory(snapshot => snapshot)
  const accounts = useAccounts(snapshot => snapshot)
  const fallbackAgState: AntigravityState = { status: 'idle', accounts: [], usage: {} }
  const antigravity: AntigravityState = useAntigravity ? useAntigravity(snapshot => snapshot) : fallbackAgState
  const [open, setOpen] = useState<OpenPane>(null)
  const [providerDraft, setProviderDraft] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [error, setError] = useState<{ kind: 'loadFailed' | 'selectFailed'; message: string } | null>(null)
  const [dragging, setDragging] = useState<SliderDrag | null>(null)
  const [effortMemory, setEffortMemory] = useState<Record<string, string>>(() => loadEffortMemory())
  const [disabledModels, setDisabledModels] = useState<Set<string>>(() => loadDisabledModels())

  useEffect(() => {
    const handleVisibilityChange = () => {
      setDisabledModels(loadDisabledModels())
    }
    window.addEventListener(MODELS_VISIBILITY_EVENT, handleVisibilityChange)
    return () => { window.removeEventListener(MODELS_VISIBILITY_EVENT, handleVisibilityChange) }
  }, [])
  const dragRef = useRef<SliderDrag | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const providerTrigger = useRef<HTMLButtonElement | null>(null)
  const modelTrigger = useRef<HTMLButtonElement | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)
  const selecting = useRef(false)

  const setDrag = (next: SliderDrag | null): void => {
    dragRef.current = next
    setDragging(next)
  }

  // Invalidate late completions and local navigation when the injected Session changes.
  useEffect(() => {
    mounted.current = true
    generation.current++
    selecting.current = false
    setOpen(null)
    setProviderDraft(undefined)
    setBusy(false)
    setLoading(false)
    setAccountError(null)
    setError(null)
    setDrag(null)
    return () => { mounted.current = false; generation.current++ }
  }, [useDirectory, useAccounts, loadDirectory, loadAccounts, selectAccount, readQuota, select])

  // Follow authoritative provider changes, but preserve a provider the user is browsing
  // until a model selection changes the authoritative route.
  useEffect(() => {
    if (directory.current?.provider !== undefined) setProviderDraft(directory.current.provider)
  }, [directory.current?.provider])

  // Sync authoritative model effort into memory so switching back remembers it.
  useEffect(() => {
    const cur = directory.current
    const effort = cur?.reasoningEffort
    if (cur?.provider && cur.model && effort !== undefined) {
      const key = `${cur.provider}/${cur.model}`
      setEffortMemory(prev => {
        if (prev[key] === effort) return prev
        const next: Record<string, string> = { ...prev, [key]: effort }
        saveEffortMemory(next)
        return next
      })
    }
  }, [directory.current?.provider, directory.current?.model, directory.current?.reasoningEffort])

  const authoritativeGroup = activeGroup(directory)
  const group = directory.groups.find(candidate => candidate.id === providerDraft) ?? authoritativeGroup
  const activeAgAccount = antigravity.accounts.find(account => account.active) ?? antigravity.accounts[0]
  const activeCodexAccount = accounts.accounts.find(account => account.active) ?? accounts.accounts[0]
  const disabledForCurrent = isAntigravityProvider(group?.id)
    ? getDisabledModelsForAccount(activeAgAccount?.id, activeAgAccount?.email)
    : isCodexProvider(group?.id)
      ? getDisabledModelsForAccount(activeCodexAccount?.id, activeCodexAccount?.email)
      : disabledModels
  const allModels = group?.models ?? []
  const models = allModels.filter(model => !disabledForCurrent.has(model.id))
  const currentModel = group === undefined || group.id !== directory.current?.provider ? undefined
    : models.find(model => isCurrentModel(directory.current, group.id, model))
  const efforts = currentModel?.reasoning?.efforts ?? []
  const currentEffort = currentModel === undefined ? undefined : directory.current?.reasoningEffort
  const currentEffortName = efforts.find(effort => effort.id === currentEffort)?.name

  const previewModel = dragging !== null && group !== undefined && dragging.provider === group.id
    ? dragging.model
    : currentModel
  const previewEfforts = previewModel?.reasoning?.efforts ?? []
  const previewEffortId = dragging !== null && group !== undefined && dragging.provider === group.id
    ? (dragging.index >= 0 ? previewEfforts[dragging.index]?.id : undefined)
    : (currentEffort ?? (currentModel && group ? resolveModelEffort(currentModel, effortMemory[`${group.id}/${currentModel.id}`] ?? effortMemory[currentModel.id]) : undefined))
  const pending = locked || busy || accounts.switchingId !== undefined || directory.status === 'selecting'
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
        setDrag(null)
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
    if (next === 'provider') {
      if (directory.groups.some(candidate => isCodexProvider(candidate.id))) {
        void loadAccounts()
      }
      if (directory.groups.some(candidate => isAntigravityProvider(candidate.id))) {
        void loadAntigravity?.()
      }
    }
  }

  const submit = (model: ProviderPanelModel | undefined, effortId: string | undefined): void => {
    if (group === undefined || model === undefined || selecting.current || pending) return
    if (effortId !== undefined) {
      const key = `${group.id}/${model.id}`
      setEffortMemory(prev => {
        const next = { ...prev, [key]: effortId }
        saveEffortMemory(next)
        return next
      })
    }
    run('selectFailed', () => select(selectionForRow(model, group.id, effortId)))
  }

  const commitDrag = (drag: SliderDrag | null): void => {
    if (drag === null || group === undefined || drag.provider !== group.id || selecting.current || pending) return
    const ladder = drag.model.reasoning?.efforts ?? []
    const effortId = drag.index < 0 ? undefined : ladder[drag.index]?.id
    if (
      directory.current?.provider === drag.provider
      && directory.current.model === drag.model.id
      && directory.current.reasoningEffort === effortId
    ) return
    submit(drag.model, effortId)
  }

  const dragAtPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
    fallback: ProviderPanelModel,
  ): SliderDrag => {
    const locate = document.elementFromPoint
    const element = typeof locate === 'function' ? locate.call(document, event.clientX, event.clientY) : null
    const originTrack = event.currentTarget
    const row = element?.closest<HTMLElement>('[data-provider-panel-model]')
    const candidateTrack = row?.querySelector<HTMLElement>('[data-provider-panel-track]') ?? null
    const band = candidateTrack?.getBoundingClientRect() ?? row?.getBoundingClientRect()
    // Require the pointer to actually enter the neighbour's own band; a small
    // vertical drift inside the current row must never switch models.
    const insideBand = band !== undefined && event.clientY >= band.top - 16 && event.clientY <= band.bottom + 16
    const candidate = row !== null && row !== undefined && insideBand
      ? models.find(entry => entry.id === row.dataset.providerPanelModel)
      : undefined
    const target = candidate ?? fallback
    const track = candidate === undefined ? originTrack : candidateTrack ?? originTrack
    const count = target.reasoning?.efforts.length ?? 0
    return {
      model: target,
      provider: group!.id,
      index: sliderIndexFromPoint(event.clientX, track.getBoundingClientRect(), count),
      source: 'pointer',
      pointerId: event.pointerId,
    }
  }

  const startPointerDrag = (event: ReactPointerEvent<HTMLDivElement>, model: ProviderPanelModel): void => {
    if (pending || (event.button !== undefined && event.button !== 0)) return
    event.preventDefault()
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    event.currentTarget.querySelector<HTMLInputElement>('input')?.focus()
    setDrag(dragAtPointer(event, model))
  }

  const movePointerDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag?.source !== 'pointer' || (drag.pointerId !== undefined && event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return
    setDrag(dragAtPointer(event, drag.model))
  }

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>, shouldCommit: boolean): void => {
    const drag = dragRef.current
    if (drag?.source !== 'pointer' || (drag.pointerId !== undefined && event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return
    if (typeof event.currentTarget.hasPointerCapture === 'function' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDrag(null)
    if (shouldCommit) commitDrag(drag)
  }

  const finishKeyboardDrag = (): void => {
    const drag = dragRef.current
    if (drag?.source !== 'keyboard') return
    setDrag(null)
    commitDrag(drag)
  }

  const renderRow = (model: ProviderPanelModel, index: number): ReactNode => {
    const ladder = model.reasoning?.efforts ?? []
    const count = ladder.length
    const provider = group!.id
    const isCurrent = isCurrentModel(directory.current, provider, model)
    const isDragTarget = dragging !== null && dragging.model.id === model.id && dragging.provider === provider
    const isRowActive = dragging !== null ? isDragTarget : isCurrent
    const key = `${provider}/${model.id}`
    const remembered = effortMemory[key] ?? effortMemory[model.id]
    const effectiveEffortId = isCurrent
      ? (currentEffort ?? resolveModelEffort(model, remembered))
      : resolveModelEffort(model, remembered)
    const resting = effortIndex(model, effectiveEffortId)
    const position = isDragTarget ? dragging.index : resting
    const ratio = count > 1 && position >= 0 ? position / (count - 1) : 0
    const effortName = ladder[position]?.name ?? (effectiveEffortId === undefined
      ? t('defaultEffort') : t('unknownEffort', { effort: effectiveEffortId }))
    const accent = accentFor(model.id, index)
    return (
      <div
        key={`${provider}/${model.id}`}
        className={isRowActive ? `${css.row} ${css.rowCurrent}` : css.row}
        data-model-accent={model.id}
        data-current={isRowActive}
        data-drag-target={isDragTarget}
        data-provider-panel-model={model.id}
        style={{
          '--dpe-accent': accent,
          '--dpe-accent-soft': `${accent}1f`,
          '--dpe-accent-edge': `${accent}66`,
        } as CSSProperties}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-provider-panel-track]')) return
          submit(model, effectiveEffortId)
        }}
      >
        <div className={css.rowHead}>
          <button
            type="button"
            className={css.rowName}
            aria-label={t('selectModel', { model: model.name })}
            aria-pressed={isRowActive}
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation()
              submit(model, effectiveEffortId)
            }}
          >{model.name}</button>
        </div>
        {count === 0 ? null : (
          <div
            className={css.track}
            data-provider-panel-track
            onPointerDown={(event) => { startPointerDrag(event, model) }}
            onPointerMove={movePointerDrag}
            onPointerUp={(event) => { finishPointerDrag(event, true) }}
            onPointerCancel={(event) => { finishPointerDrag(event, false) }}
          >
            <span className={css.rail} aria-hidden="true" />
            {ladder.map((effort, stop) => (
              <span
                key={effort.id}
                className={css.stop}
                aria-hidden="true"
                data-active={stop === position}
                data-edge={stop === 0 ? 'start' : stop === count - 1 ? 'end' : 'middle'}
                style={{ left: `calc(10px + (100% - 20px) * ${count > 1 ? stop / (count - 1) : 0})` }}
              ><span className={css.stopLabel}>{effort.name}</span></span>
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
                setDrag({ model, provider, index: Number(event.target.value), source: 'keyboard' })
              }}
              onKeyUp={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp'].includes(event.key)) {
                  finishKeyboardDrag()
                }
              }}
              onBlur={finishKeyboardDrag}
            />
          </div>
        )}
      </div>
    )
  }

  const chooseAccount = (provider: string, id: string, active: boolean): void => {
    if (pending) return
    setProviderDraft(provider)
    setAccountError(null)
    if (active) {
      setOpen(null)
      queueMicrotask(() => { providerTrigger.current?.focus() })
      return
    }
    void selectAccount(id).then(() => {
      if (!mounted.current) return
      setOpen(null)
      queueMicrotask(() => { providerTrigger.current?.focus() })
    }).catch((cause: unknown) => {
      if (!mounted.current) return
      setAccountError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  const requestQuota = (id: string): void => {
    if (pending) return
    setAccountError(null)
    void readQuota(id).catch((cause: unknown) => {
      if (!mounted.current) return
      setAccountError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  if (!available) return null

  const activeAccount = accounts.accounts.find(account => account.active)
  const baseProviderLabel = group?.name ?? directory.current?.provider ?? t('providerTrigger')
  const providerLabel = isCodexProvider(group?.id) && activeAccount !== undefined
    ? `${baseProviderLabel} · ${activeAccount.label}`
    : isAntigravityProvider(group?.id) && activeAgAccount !== undefined
      ? `${baseProviderLabel} · ${activeAgAccount.label}`
      : baseProviderLabel
  const modelLabel = currentModel?.name ?? (group?.id === directory.current?.provider
    ? directory.current?.model ?? t('trigger') : t('trigger'))

  const isAg = isAntigravityProvider(group?.id)
  const isCodex = isCodexProvider(group?.id)

  const agUsage = antigravity?.usage ?? {}
  const quotaData = activeAgAccount ? (agUsage[activeAgAccount.id] ?? agUsage['default']) : undefined
  const primaryGroup = quotaData?.groups?.find(g => g.group === 'gemini') ?? quotaData?.groups?.[0]
  const fiveHourWin = primaryGroup?.windows?.find(w => w.window === '5h')
  const weeklyWin = primaryGroup?.windows?.find(w => w.window === 'weekly')

  useEffect(() => {
    if (isAntigravityProvider(group?.id)) {
      void loadAntigravity?.().catch(() => {})
      if (activeAgAccount) {
        void readAntigravityQuota?.(activeAgAccount.id).catch(() => {})
      }
    }
  }, [group?.id, activeAgAccount?.id, loadAntigravity, readAntigravityQuota])

  // Periodic auto-refresh every 60 seconds for active provider quota
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (isAntigravityProvider(group?.id) && activeAgAccount) {
        void readAntigravityQuota?.(activeAgAccount.id).catch(() => {})
      } else if (isCodexProvider(group?.id) && activeAccount) {
        void readQuota?.(activeAccount.id).catch(() => {})
      }
    }, 60_000)
    return () => clearInterval(timer)
  }, [group?.id, activeAgAccount?.id, activeAccount?.id, readAntigravityQuota, readQuota])

  const fiveHourPct = fiveHourWin !== undefined ? Math.round(fiveHourWin.remainingFraction * 100) : undefined
  const weeklyPct = weeklyWin !== undefined ? Math.round(weeklyWin.remainingFraction * 100) : undefined
  const fiveHourReset = formatRemaining(fiveHourWin?.resetTime, fiveHourPct)
  const weeklyReset = formatRemaining(weeklyWin?.resetTime, weeklyPct)

  const codexUsage = activeAccount ? accounts.usage[activeAccount.id] : undefined
  const codexUsageVal = codexUsage?.status === 'ready' ? codexUsage.value : undefined
  const codex5h = codexUsageVal?.shortPercent
  const codexWeekly = codexUsageVal?.weeklyPercent
  const codex5hReset = codexUsageVal?.shortResetsAt
    ? formatRemaining(new Date(codexUsageVal.shortResetsAt * 1000).toISOString(), codex5h)
    : undefined
  const codexWeeklyReset = codexUsageVal?.weeklyResetsAt
    ? formatRemaining(new Date(codexUsageVal.weeklyResetsAt * 1000).toISOString(), codexWeekly)
    : undefined

  const codexPlanType = (activeAccount?.planType ?? '').toUpperCase()
  const isCodexPro = codexPlanType === 'PRO' || codexPlanType.includes('PRO')
  const codexPillText = isCodexPro
    ? (codexWeekly !== undefined ? t('weeklyQuota', { value: codexWeekly }) : (codex5h !== undefined ? t('fiveHourQuota', { value: codex5h }) : '周 100%'))
    : (codex5h !== undefined ? t('fiveHourQuota', { value: codex5h }) : (codexWeekly !== undefined ? t('weeklyQuota', { value: codexWeekly }) : '5h 100%'))

  const quotaBadge = isAg ? (
    <div className={css.quotaWrapper}>
      <button
        type="button"
        className={css.quotaTrigger}
        onClick={() => { if (activeAgAccount) void readAntigravityQuota?.(activeAgAccount.id).catch(() => {}) }}
      >
        {fiveHourPct !== undefined ? t('fiveHourQuota', { value: fiveHourPct }) : '5h 100%'}
      </button>
      <div className={css.quotaTooltip} role="tooltip">
        <div className={css.quotaTooltipRow}>
          <span className={css.quotaTooltipName}>5小时额度:</span>
          <div>
            <span className={css.quotaTooltipValue}>{fiveHourPct !== undefined ? `${fiveHourPct}%` : '100%'}</span>
            {fiveHourReset ? <span className={css.quotaTooltipReset}>({fiveHourReset})</span> : null}
          </div>
        </div>
        <div className={css.quotaTooltipRow}>
          <span className={css.quotaTooltipName}>周额度:</span>
          <div>
            <span className={css.quotaTooltipValue}>{weeklyPct !== undefined ? `${weeklyPct}%` : '100%'}</span>
            {weeklyReset ? <span className={css.quotaTooltipReset}>({weeklyReset})</span> : null}
          </div>
        </div>
      </div>
    </div>
  ) : isCodex && (codexWeekly !== undefined || codex5h !== undefined) ? (
    <div className={css.quotaWrapper}>
      <button
        type="button"
        className={css.quotaTrigger}
        onClick={() => { if (activeAccount) void readQuota?.(activeAccount.id).catch(() => {}) }}
      >
        {codexPillText}
      </button>
      <div className={css.quotaTooltip} role="tooltip">
        {!isCodexPro ? (
          <div className={css.quotaTooltipRow}>
            <span className={css.quotaTooltipName}>5小时额度:</span>
            <div>
              <span className={css.quotaTooltipValue}>{codex5h !== undefined ? `${codex5h}%` : '100%'}</span>
              {codex5hReset ? <span className={css.quotaTooltipReset}>({codex5hReset})</span> : null}
            </div>
          </div>
        ) : null}
        <div className={css.quotaTooltipRow}>
          <span className={css.quotaTooltipName}>周额度:</span>
          <div>
            <span className={css.quotaTooltipValue}>{codexWeekly !== undefined ? `${codexWeekly}%` : '100%'}</span>
            {codexWeeklyReset ? <span className={css.quotaTooltipReset}>({codexWeeklyReset})</span> : null}
          </div>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div
      className={css.root}
      data-testid="dsh-provider-extension"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || open === null) return
        event.preventDefault()
        const focus = open === 'provider' ? providerTrigger.current : modelTrigger.current
        setOpen(null)
        focus?.focus()
      }}
      ref={root}
    >
      {quotaBadge}

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
            <button type="button" className={css.reload} disabled={pending || fetching} onClick={() => {
              reload()
              void loadAccounts()
            }}>{t('reload')}</button>
          </div>
          {error?.kind === 'loadFailed' ? <p className={css.error} role="alert">{t('loadFailed', { message: error.message })}</p> : null}
          {fetching ? <p className={css.note} role="status">{t('loading')}</p> : null}
          {directory.groups.length === 0 && !fetching ? <p className={css.note}>{t('providerEmpty')}</p> : null}
          <div className={css.providerList} role="listbox" aria-label={t('providerTitle')}>
            {directory.groups.map(candidate => {
              const selected = candidate.id === group?.id
              if (isAntigravityProvider(candidate.id) && antigravity.accounts.length > 0) {
                return (
                  <div key={candidate.id} className={css.providerFamily} role="group" aria-label={candidate.name}>
                    <div className={css.providerFamilyHead}>
                      <span>{candidate.name}</span>
                      <span className={css.providerCount}>{t('accountCount', { count: antigravity.accounts.length })}</span>
                    </div>
                    {antigravity.accounts.map(account => {
                      const email = maskedEmail(account.email)
                      return (
                        <div key={account.id} className={css.accountRow}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected && account.active}
                            className={selected && account.active
                              ? `${css.accountOption} ${css.providerCurrent}` : css.accountOption}
                            disabled={pending}
                            onClick={() => {
                              setProviderDraft(candidate.id)
                              if (!account.active && selectAntigravityAccount) {
                                void selectAntigravityAccount(account.id)
                              }
                              setOpen(null)
                              queueMicrotask(() => { providerTrigger.current?.focus() })
                            }}
                          >
                            <span className={css.accountIdentity}>
                              <span className={css.accountLabel}>{account.label}</span>
                              {email === undefined ? null : <span className={css.accountEmail}>{email}</span>}
                            </span>
                            <span className={css.accountMeta}>
                              <span className={css.accountState}>
                                {antigravity.switchingId === account.id ? t('accountSwitching')
                                  : account.active ? t('accountActive') : t('accountUse')}
                              </span>
                            </span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              }
              if (!isCodexProvider(candidate.id) || accounts.status === 'error' || accounts.accounts.length === 0) {
                return (
                  <div key={candidate.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={selected ? `${css.providerOption} ${css.providerCurrent}` : css.providerOption}
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
                    {isCodexProvider(candidate.id) && accounts.status === 'error'
                      ? <p className={css.accountNote}>{t('accountLoadFailed', { message: accounts.error ?? t('accountUnavailable') })}</p>
                      : isCodexProvider(candidate.id) && (accounts.status === 'idle' || accounts.status === 'loading')
                        ? <p className={css.accountNote}>{t('accountsLoading')}</p> : null}
                  </div>
                )
              }
              return (
                <div key={candidate.id} className={css.providerFamily} role="group" aria-label={candidate.name}>
                  <div className={css.providerFamilyHead}>
                    <span>{candidate.name}</span>
                    <span className={css.providerCount}>{t('accountCount', { count: accounts.accounts.length })}</span>
                  </div>
                  {accountError === null ? null : <p className={css.accountError} role="alert">{t('accountSwitchFailed', { message: accountError })}</p>}
                  {accounts.restoreFailed === true ? <p className={css.accountError} role="alert">{t('quotaRestoreFailed')}</p> : null}
                  {accounts.accounts.map(account => {
                    const email = maskedEmail(account.email)
                    const usage = accounts.usage[account.id]
                    const weekly = usage?.status === 'ready' ? usage.value.weeklyPercent : undefined
                    const quotaText = usage?.status === 'loading' ? t('quotaReading')
                      : usage?.status === 'error' ? t('quotaFailedShort')
                        : usage?.status === 'ready'
                          ? weekly === undefined ? t('quotaNoWeekly') : t('weeklyQuota', { value: weekly })
                          : undefined
                    const canRead = !account.active && (usage === undefined || usage.status === 'error')
                    return (
                      <div key={account.id} className={css.accountRow}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected && account.active}
                          className={selected && account.active
                            ? `${css.accountOption} ${css.providerCurrent}` : css.accountOption}
                          disabled={pending}
                          onClick={() => { chooseAccount(candidate.id, account.id, account.active) }}
                        >
                          <span className={css.accountIdentity}>
                            <span className={css.accountLabel}>{account.label}</span>
                            {email === undefined ? null : <span className={css.accountEmail}>{email}</span>}
                          </span>
                          <span className={css.accountMeta}>
                            <span className={css.accountState}>
                              {accounts.switchingId === account.id ? t('accountSwitching')
                                : account.active ? t('accountActive') : t('accountUse')}
                            </span>
                            {quotaText === undefined ? null : <span className={css.accountQuota}>{quotaText}</span>}
                          </span>
                        </button>
                        {canRead ? (
                          <button
                            type="button"
                            className={css.accountRead}
                            disabled={pending}
                            onClick={() => { requestQuota(account.id) }}
                          >{t('readQuota')}</button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )
            })}
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
            {previewModel === undefined ? null : previewEfforts.length === 0
              ? <p className={css.note}>{t('noEffort')}</p>
              : (
                <div className={css.pills} role="group" aria-label={t('effort')}>
                  {previewEfforts.map(effort => (
                    <button
                      key={effort.id}
                      type="button"
                      className={css.pill}
                      aria-pressed={effort.id === previewEffortId}
                      disabled={pending}
                      onClick={() => { submit(previewModel, effort.id) }}
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
