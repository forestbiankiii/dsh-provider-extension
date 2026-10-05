import { z } from 'zod'

/** The runtime log is newer than some installed dev typings. Narrow only this boundary. */
export interface UsageEvent { type: string; seq: number; time: number; data: unknown }
const count = z.number().int().nonnegative().safe()
const time = z.number().finite()
const optionalTokens = ['cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const
const tokenSchema = z.object({
  inputTokens: count, outputTokens: count, totalTokens: count, uncachedInputTokens: count.nullable(),
  cacheReadTokens: count, cacheWriteTokens: count, reasoningTokens: count,
  missingOptional: z.array(z.enum(optionalTokens)),
}).strict()
const stepSchema = z.object({
  turn: count, step: count, startedAt: time, endedAt: time.nullable(),
  firstTokenAt: time.nullable(), firstVisibleTokenAt: time.nullable(), modelEndedAt: time.nullable(),
  provider: z.string(), model: z.string(),
  status: z.enum(['pending', 'succeeded', 'failed', 'cancelled', 'unknown']),
  finalized: z.boolean(), retries: count, lastRetry: count,
  usage: tokenSchema.nullable(), missingUsage: count, partial: z.boolean(),
}).strict()
export const usageStateSchema = z.object({
  inheritedEventCount: count, provider: z.string(), model: z.string(), rows: z.array(stepSchema),
}).strict()
export type UsageState = z.infer<typeof usageStateSchema>
export type UsageStep = UsageState['rows'][number]
type Tokens = NonNullable<UsageStep['usage']>

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 }
function timestamp(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function tokens(value: unknown): Tokens | null {
  const data = object(value)
  if (!integer(data.inputTokens) || !integer(data.outputTokens)) return null
  const read = integer(data.cacheReadTokens) ? data.cacheReadTokens : 0
  // Both inclusive Chat usage and exclusive Messages usage occur in existing raw logs.
  const uncachedInputTokens = read === 0 ? (!integer(data.totalTokens) || data.totalTokens === data.inputTokens + data.outputTokens ? data.inputTokens : null)
    : data.totalTokens === data.inputTokens + data.outputTokens + read ? data.inputTokens
    : data.totalTokens === data.inputTokens + data.outputTokens && read <= data.inputTokens ? data.inputTokens - read : null
  return {
    inputTokens: data.inputTokens, outputTokens: data.outputTokens, uncachedInputTokens,
    totalTokens: integer(data.totalTokens) ? data.totalTokens : data.inputTokens + data.outputTokens,
    cacheReadTokens: integer(data.cacheReadTokens) ? data.cacheReadTokens : 0,
    cacheWriteTokens: integer(data.cacheWriteTokens) ? data.cacheWriteTokens : 0,
    reasoningTokens: integer(data.reasoningTokens) ? data.reasoningTokens : 0,
    missingOptional: optionalTokens.filter(key => !integer(data[key])),
  }
}
function addUsage(row: UsageStep, usage: Tokens | null, partial: boolean): void {
  if (!usage) { row.missingUsage++; return }
  if (!row.usage) row.usage = usage
  else {
    const previous = row.usage
    row.usage = { ...previous, uncachedInputTokens: previous.uncachedInputTokens === null || usage.uncachedInputTokens === null ? null : previous.uncachedInputTokens + usage.uncachedInputTokens, missingOptional: [...new Set([...previous.missingOptional, ...usage.missingOptional])] }
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens', ...optionalTokens] as const) row.usage[key] += usage[key]
  }
  row.partial ||= partial
}
function first(row: UsageStep, at: number, visible: boolean): void {
  row.firstTokenAt = row.firstTokenAt === null ? at : Math.min(row.firstTokenAt, at)
  if (visible) row.firstVisibleTokenAt = row.firstVisibleTokenAt === null ? at : Math.min(row.firstVisibleTokenAt, at)
}
function delta(row: UsageStep, value: unknown, at: number): void {
  const chunk = object(value)
  if ((chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && typeof chunk.text === 'string' && chunk.text.length > 0) {
    first(row, at, chunk.type === 'text-delta')
  }
}
/** Read timings and terminal attempt metadata, never retain any streamed content. dt are cumulative gaps. */
function stream(row: UsageStep, value: unknown): { usage: Tokens | null; terminal: boolean; kind: unknown } {
  let usage: Tokens | null = null
  let terminal = false
  let kind: unknown
  for (const valueRecord of Array.isArray(value) ? value : []) {
    const record = object(valueRecord)
    if ((record.type === 'text-chunks' || record.type === 'reasoning-chunks') && timestamp(record.time0) && Array.isArray(record.texts)) {
      let at = record.time0
      const gaps = Array.isArray(record.dt) ? record.dt : []
      for (let index = 0; index < record.texts.length; index++) {
        if (index > 0) {
          if (!timestamp(gaps[index - 1])) break
          at += gaps[index - 1] as number
        }
        const text = record.texts[index]
        if (typeof text === 'string' && text.length > 0) first(row, at, record.type === 'text-chunks')
      }
    } else if (record.type === 'chunk' && timestamp(record.time)) {
      const chunk = object(record.chunk)
      delta(row, chunk, record.time)
      if (chunk.type === 'usage') usage = tokens(chunk.usage) // Snapshot, not an increment.
      if (chunk.type === 'finish') { terminal = true; kind = object(chunk.reason).kind }
    }
  }
  return { usage, terminal, kind }
}

/** Headers contain no model in current DSH; optional config supports standalone callers. */
export function initUsage(header: { createdAt?: number; config?: { provider?: string; model?: string } }, inheritedEventCount = 0): UsageState {
  return { inheritedEventCount, provider: header.config?.provider ?? '', model: header.config?.model ?? '', rows: [] }
}
export function applyUsage(state: UsageState, event: UsageEvent): UsageState {
  const data = object(event.data)
  const inherited = event.seq < state.inheritedEventCount
  if (event.type === 'request/header') {
    const config = object(object(data.header).config)
    const provider = typeof config.provider === 'string' ? config.provider : state.provider
    const model = typeof config.model === 'string' ? config.model : state.model
    const active = state.rows.at(-1)
    const updateActive = !inherited && active && active.endedAt === null && !active.finalized && (active.provider !== provider || active.model !== model)
    if (provider === state.provider && model === state.model && !updateActive) return state
    const rows = updateActive ? [...state.rows.slice(0, -1), { ...active, provider, model }] : state.rows
    return { ...state, provider, model, rows }
  }
  if (inherited || !integer(data.turn)) return state
  if (event.type === 'turn/end') {
    // A turn failure belongs only to its last unfinished/failed step, never earlier successful ones.
    let index = state.rows.length - 1
    while (index >= 0 && state.rows[index]?.turn !== data.turn) index--
    const previous = state.rows[index]
    if (!previous || previous.finalized && previous.status === 'succeeded') return state
    const kind = object(data.reason).kind
    const status = kind === 'error' ? 'failed' : kind === 'aborted' || kind === 'interrupted' ? 'cancelled' : previous.status === 'pending' ? 'unknown' : previous.status
    if (previous.finalized && previous.status === status) return state
    const row = { ...previous, status, finalized: true, endedAt: previous.endedAt ?? event.time } as UsageStep
    const rows = state.rows.slice(); rows[index] = row
    return { ...state, rows }
  }
  if (!integer(data.step)) return state
  const last = state.rows.length - 1
  const index = state.rows[last]?.turn === data.turn && state.rows[last]?.step === data.step ? last : state.rows.findIndex(row => row.turn === data.turn && row.step === data.step)
  if (event.type === 'step/start') {
    if (index !== -1) return state
    return { ...state, rows: [...state.rows, {
      turn: data.turn, step: data.step, startedAt: event.time, endedAt: null,
      firstTokenAt: null, firstVisibleTokenAt: null, modelEndedAt: null, provider: state.provider, model: state.model,
      status: 'pending', finalized: false, retries: 0, lastRetry: 0, usage: null, missingUsage: 0, partial: false,
    }] }
  }
  const previous = state.rows[index]
  if (!previous || previous.finalized) return state // No own step/start means no billable request.
  const row = { ...previous }
  switch (event.type) {
    case 'step/end':
      row.endedAt = event.time
      if (row.status === 'pending') row.status = 'unknown'
      row.finalized = row.status === 'succeeded' // An unknown/failed step may still receive turn/end attribution.
      break
    case 'llm/retry':
      if (row.status === 'failed') return state
      row.status = 'failed' // Scheduled retry is not a started attempt.
      break
    case 'llm/retry-started':
      if (!integer(data.retry) || data.retry <= row.lastRetry) return state
      row.retries++; row.lastRetry = data.retry; row.status = 'pending'; row.modelEndedAt = null
      break
    case 'assistant/chunk': {
      const chunk = object(data.chunk)
      if ((chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') || typeof chunk.text !== 'string' || chunk.text.length === 0) return state
      delta(row, chunk, event.time)
      if (row.firstTokenAt === previous.firstTokenAt && row.firstVisibleTokenAt === previous.firstVisibleTokenAt) return state
      break
    }
    case 'assistant/message': {
      row.modelEndedAt = event.time
      const source = object(object(data.message).source)
      if (typeof source.provider === 'string') row.provider = source.provider
      if (typeof source.model === 'string') row.model = source.model
      stream(row, data.stream)
      addUsage(row, tokens(data.usage), data.interrupted === true)
      row.status = data.interrupted === true ? 'unknown' : 'succeeded'
      break
    }
    case 'assistant/attempt': {
      row.modelEndedAt = event.time
      const result = stream(row, data.stream)
      // A terminal attempt may expose one final usage; intermediate snapshots alone are not authoritative.
      addUsage(row, result.terminal ? result.usage : null, true)
      row.status = result.kind === 'error' ? 'failed' : result.kind === 'aborted' ? 'cancelled' : 'unknown'
      break
    }
    default: return state
  }
  const rows = state.rows.slice(); rows[index] = row
  return { ...state, rows }
}

/** Fold the raw log, not Session.surface. Compaction replacement events never subtract consumed tokens. */
export function foldUsage(header: Parameters<typeof initUsage>[0], inheritedEventCount: number, events: readonly UsageEvent[]): UsageState {
  return events.reduce(applyUsage, initUsage(header, inheritedEventCount))
}
export const snapshotUsage = foldUsage
export const usageProjectionDefinition = {
  key: 'providerUsage' as const, stateVersion: 2, stateSchema: usageStateSchema,
  init: initUsage, apply: applyUsage,
  // ponytail: full metadata rows cost O(history) per changed step; use a Host-only fold and bounded wire view if long sessions make publication expensive.
  wire: { viewSchema: usageStateSchema, view: (state: UsageState): UsageState => state },
}
