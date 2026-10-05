import { describe, expect, it } from 'vitest'
import { applyUsage, foldUsage, initUsage, usageProjectionDefinition } from '../src/usage/fold.ts'
import type { UsageEvent, UsageState } from '../src/usage/fold.ts'
import { aggregateUsage } from '../src/usage/report.ts'
import type { UsageReportSession } from '../src/usage/report.ts'
import type { UsagePrice, UsageQuery } from '../src/usage/types.ts'

const header = { createdAt: 0, config: { provider: 'deepseek', model: 'chat' } }
const usage = (inputTokens = 100, outputTokens = 10) => ({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, cacheReadTokens: 20, cacheWriteTokens: 0, reasoningTokens: 3 })
const message = (extra: Record<string, unknown> = {}) => ({ turn: 1, step: 1, message: { source: { provider: 'deepseek', model: 'chat' } }, stream: [], usage: usage(), ...extra })
const event = (type: string, time: number, data: unknown): Omit<UsageEvent, 'seq'> => ({ type, time, data })
const log = (...events: Omit<UsageEvent, 'seq'>[]): UsageEvent[] => events.map((entry, seq) => ({ ...entry, seq }))
const started = (at = 10, step = 1) => event('step/start', at, { turn: 1, step })
const ended = (at = 100, step = 1) => event('step/end', at, { turn: 1, step })
const endTurn = (kind: string, at = 110) => event('turn/end', at, { turn: 1, reason: { kind } })
const query: UsageQuery = { days: 7, timezone: 'UTC', role: 'all' }
const prices: UsagePrice[] = [{ provider: 'deepseek', model: 'chat', currency: 'CNY', input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0 }]
const now = Date.parse('2026-06-15T12:00:00Z')
function session(id: string, at = now, tokens = 100, provider = 'deepseek', model = 'chat', extra: Partial<UsageReportSession['header']> = {}): UsageReportSession {
  const state = foldUsage({ createdAt: at, config: { provider, model } }, 0, log(
    started(at), event('assistant/message', at + 50, message({ message: { source: { provider, model } }, usage: usage(tokens) })), ended(at + 100),
  ))
  return { header: { id, createdAt: at, cwd: '/work', ...extra }, title: id, state }
}
function report(state: UsageState) { return aggregateUsage([{ header: { id: 'one', createdAt: 0 }, title: 'One', state }], { ...query, days: 0 }, prices, { now }) }

describe('raw-log usage projection', () => {
  it('has a strict secret-free JSON state and identity wire view', () => {
    const state = foldUsage(header, 0, log(started(), event('assistant/message', 80, message({ message: { source: { provider: 'deepseek', model: 'chat', credential: 'PRIVATE' }, content: 'PRIVATE' }, stream: [{ type: 'text-chunks', time0: 20, dt: [], texts: ['PRIVATE'] }] })), ended()))
    expect(usageProjectionDefinition.key).toBe('providerUsage')
    expect(usageProjectionDefinition.stateVersion).toBe(2)
    expect(usageProjectionDefinition.stateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(usageProjectionDefinition.stateSchema.safeParse({ ...state, credential: 'PRIVATE' }).success).toBe(false)
    expect(usageProjectionDefinition.wire.view(state)).toBe(state)
    expect(JSON.stringify(state)).not.toContain('PRIVATE')
  })
  it('excludes fork-inherited requests/tokens but retains inherited request model configuration', () => {
    const events = log(event('request/header', 0, { header: { config: { provider: 'deepseek-account', model: 'reasoner', apiKey: 'SECRET' } } }), started(), event('assistant/message', 50, message()), ended(), started(200, 2), event('assistant/message', 250, message({ step: 2, message: { source: {} } })), ended(300, 2))
    const state = foldUsage({ createdAt: 200 }, 4, events)
    expect(state.inheritedEventCount).toBe(4)
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({ provider: 'deepseek-account', model: 'reasoner', step: 2 })
    expect(report(state).overview.period).toMatchObject({ requests: 1, inputTokens: 100 })
    expect(JSON.stringify(state)).not.toContain('SECRET')
    const noOwnStart = foldUsage(header, 2, log(started(), ended(), event('assistant/message', 300, message())))
    expect(noOwnStart.rows).toEqual([])
  })
  it('returns the original state for ignored events, repeated configs and stream usage snapshots', () => {
    const state = foldUsage(header, 0, log(started()))
    for (const entry of log(event('tool/result', 40, {}), event('assistant/chunk', 50, { turn: 1, step: 1, chunk: { type: 'usage', usage: usage() } }), event('request/header', 60, { header: { config: header.config } }))) expect(applyUsage(state, entry)).toBe(state)
    expect(applyUsage(state, { ...started(), seq: 1 })).toBe(state)
  })
  it('counts requests by step, sums distinct final host messages, not repeated stream usage snapshots', () => {
    const stream = [1, 2, 3].map(index => ({ type: 'chunk', time: index * 20, chunk: { type: 'usage', usage: usage(999, 999) } }))
    const state = foldUsage(header, 0, log(started(), event('assistant/message', 50, message({ usage: usage(10, 2), stream })), event('assistant/message', 70, message({ usage: usage(15, 3), stream })), ended()))
    expect(report(state).overview.allTime).toMatchObject({ requests: 1, succeeded: 1, inputTokens: 25, outputTokens: 5, totalTokens: 30 })
  })
  it('counts only started retries, deduplicates retry numbers and does not charge scheduled retry attempts', () => {
    const state = foldUsage(header, 0, log(started(), event('llm/retry', 20, { turn: 1, step: 1, retry: 1 }), event('llm/retry-started', 30, { turn: 1, step: 1, retry: 1 }), event('llm/retry-started', 31, { turn: 1, step: 1, retry: 1 }), event('llm/retry', 40, { turn: 1, step: 1, retry: 2 }), ended(), endTurn('error')))
    expect(report(state).overview.allTime).toMatchObject({ requests: 1, retries: 1, failed: 1, succeeded: 0, missingUsage: 1 })
  })
  it.each(['error', 'aborted'] as const)('attributes %s only to the last unfinished step after step/end', kind => {
    const state = foldUsage(header, 0, log(started(), event('assistant/message', 50, message()), ended(), started(120, 2), ended(160, 2), endTurn(kind, 170)))
    expect(state.rows[0]).toMatchObject({ status: 'succeeded', finalized: true })
    expect(state.rows[1]).toMatchObject({ status: kind === 'error' ? 'failed' : 'cancelled', finalized: true })
    expect(report(state).overview.allTime).toMatchObject({ requests: 2, succeeded: 1, failed: Number(kind === 'error'), cancelled: Number(kind === 'aborted') })
  })
  it('does not overwrite an already successful last step with a later turn error', () => {
    const state = foldUsage(header, 0, log(started(), event('assistant/message', 50, message()), ended()))
    expect(applyUsage(state, { ...endTurn('error'), seq: 3 })).toBe(state)
  })
  it('does not infer success or usage from a completed turn, and counts in-flight requests without success', () => {
    const pending = foldUsage(header, 0, log(started()))
    expect(report(pending).overview.period).toMatchObject({ requests: 1, succeeded: 0, timedRequests: 0, missingUsage: 1, unpricedRequests: 1, costs: [] })
    const complete = foldUsage(header, 0, log(started(), ended(), endTurn('completed')))
    expect(complete.rows[0]).toMatchObject({ usage: null, status: 'unknown', finalized: true })
    expect(report(complete).overview.period.succeeded).toBe(0)
  })
  it('keeps missing final usage unknown even when a stream includes usage snapshots', () => {
    const state = foldUsage(header, 0, log(started(), event('assistant/message', 70, message({ usage: undefined, stream: [{ type: 'chunk', time: 50, chunk: { type: 'usage', usage: usage() } }] })), ended()))
    expect(state.rows[0]?.usage).toBeNull()
    expect(report(state).overview.period).toMatchObject({ missingUsage: 1, inputTokens: 0, unpricedRequests: 1, costs: [] })
  })
  it('accepts only final usage from explicitly terminal attempts and flags interrupted known usage partial', () => {
    const stream = [
      { type: 'chunk', time: 20, chunk: { type: 'usage', usage: usage(10, 1) } },
      { type: 'chunk', time: 30, chunk: { type: 'usage', usage: usage(20, 2) } },
      { type: 'chunk', time: 40, chunk: { type: 'finish', reason: { kind: 'error' } } },
    ]
    const known = foldUsage(header, 0, log(started(), event('assistant/attempt', 50, { turn: 1, step: 1, stream }), ended(), endTurn('error')))
    expect(report(known).overview.period).toMatchObject({ inputTokens: 20, outputTokens: 2, partialUsage: 1, failed: 1 })
    const unknown = foldUsage(header, 0, log(started(), event('assistant/attempt', 50, { turn: 1, step: 1, stream: stream.slice(0, -1) }), ended(), endTurn('error')))
    expect(unknown.rows[0]?.usage).toBeNull()
    const interrupted = foldUsage(header, 0, log(started(), event('assistant/message', 50, message({ interrupted: true })), ended(), endTurn('aborted')))
    expect(report(interrupted).overview.period).toMatchObject({ partialUsage: 1, cancelled: 1, failed: 0, succeeded: 0 })
  })
  it('distinguishes first reasoning token from first visible text in old chunk logs', () => {
    const state = foldUsage(header, 0, log(started(), event('assistant/chunk', 12, { turn: 1, step: 1, chunk: { type: 'text-delta', text: '' } }), event('assistant/chunk', 20, { turn: 1, step: 1, chunk: { type: 'block-start' } }), event('assistant/chunk', 25, { turn: 1, step: 1, chunk: { type: 'reasoning-delta', text: 'private thought' } }), event('assistant/chunk', 40, { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'visible text' } }), event('assistant/message', 90, message()), ended()))
    expect(state.rows[0]).toMatchObject({ firstTokenAt: 25, firstVisibleTokenAt: 40 })
    expect(report(state).overview.period).toMatchObject({ ttftMs: 15, ttftRequests: 1, decodeMs: 65, decodeTokens: 10 })
  })
  it('ends model latency at settlement rather than including subsequent tool execution', () => {
    const state = foldUsage(header, 0, log(started(), event('assistant/message', 50, message({ stream: [{ type: 'text-chunks', time0: 20, dt: [], texts: ['answer'] }] })), event('tool/result', 100_050, { turn: 1, step: 1 }), ended(100_100)))
    expect(state.rows[0]).toMatchObject({ modelEndedAt: 50, endedAt: 100_100 })
    expect(report(state).overview.period).toMatchObject({ elapsedMs: 40, timedRequests: 1, ttftMs: 10, decodeMs: 30 })
  })
  it('uses cumulative gap dt and ignores empty/tool deltas in embedded compact streams', () => {
    const stream = [
      { type: 'reasoning-chunks', time0: 20, dt: [3], texts: ['', 'reasoning'] },
      { type: 'tool-call-chunks', time0: 15, dt: [], args: ['arguments'] },
      { type: 'text-chunks', time0: 30, dt: [5, 7], texts: ['', '', 'hello'] },
      { type: 'chunk', time: 18, chunk: { type: 'block-start' } },
    ]
    const state = foldUsage(header, 0, log(started(), event('assistant/message', 80, message({ stream })), ended()))
    expect(state.rows[0]).toMatchObject({ firstTokenAt: 23, firstVisibleTokenAt: 42 })
  })
  it('does not subtract actual consumption when compaction replaces the current surface', () => {
    const events = log(started(), event('assistant/message', 50, message()), ended(), event('assistant/message', 120, message({ usage: usage(900), surfaceOp: { op: 'replace', startSeq: 0, endSeq: 3 } })), event('session/compaction', 130, { content: 'PRIVATE' }))
    expect(report(foldUsage(header, 0, events)).overview.period).toMatchObject({ requests: 1, inputTokens: 100 })
  })
})

describe('usage report filtering and pricing', () => {
  it('uses requested local calendar dates across UTC day/month boundaries and DST', () => {
    const data = [session('before', Date.parse('2026-03-01T07:59:59Z')), session('after', Date.parse('2026-03-01T08:00:00Z'))]
    const result = aggregateUsage(data, { ...query, timezone: 'America/Los_Angeles' }, prices, { now: Date.parse('2026-03-01T10:00:00Z') })
    expect(result.overview).toMatchObject({ allTime: { requests: 2 }, today: { requests: 1 }, month: { requests: 1 } })
    expect(result.daily.find(day => day.date === '2026-02-28')?.metrics.requests).toBe(1)
    expect(result.daily.find(day => day.date === '2026-03-01')?.metrics.requests).toBe(1)
    const dst = aggregateUsage([session('dst-before', Date.parse('2026-03-08T09:59:00Z')), session('dst-after', Date.parse('2026-03-08T10:01:00Z'))], { ...query, timezone: 'America/Los_Angeles' }, prices, { now: Date.parse('2026-03-08T22:00:00Z') })
    expect(dst.overview.today.requests).toBe(2)
  })
  it('classifies forks as main, inherits missing subagent cwd only in report and does not roll up child usage', () => {
    const parent = session('parent')
    const child = session('child', now, 200, 'deepseek', 'chat', { origin: 'subagent', parentSession: 'parent' })
    delete child.header.cwd
    const fork = session('fork', now, 300, 'deepseek', 'chat', { parentSession: 'parent', cwd: '/fork' })
    const data = [parent, child, fork]
    const main = aggregateUsage(data, { ...query, role: 'main' }, prices, { now })
    expect(main.overview.period).toMatchObject({ requests: 2, inputTokens: 400 })
    expect(main.sessions.map(row => row.id)).toEqual(['fork', 'parent'])
    const subagent = aggregateUsage(data, { ...query, role: 'subagent', workspace: '/work' }, prices, { now })
    expect(subagent.overview.period).toMatchObject({ requests: 1, inputTokens: 200 })
    expect(subagent.sessions[0]).toMatchObject({ workspace: '/work', role: 'subagent', parentSession: 'parent' })
    expect(child.header.cwd).toBeUndefined()
    expect(aggregateUsage(data, query, prices, { now }).overview.allTime.inputTokens).toBe(600)
  })
  it('applies all categorical filters to every overview, period to ranks, but not days to the 365-day grid/options', () => {
    const data = [session('older', now - 20 * 86_400_000, 9000), session('current', now, 100), session('other-work', now, 500, 'deepseek', 'chat', { cwd: '/else' }), session('other-model', now, 500, 'deepseek', 'reasoner'), session('other-provider', now, 500, 'other', 'chat')]
    const selected = { ...query, workspace: '/work', provider: 'deepseek', model: 'chat' }
    const result = aggregateUsage(data, selected, prices, { now, workspaceTitles: new Map([['/work', 'Project']]) })
    expect(result.overview).toMatchObject({ allTime: { requests: 2, inputTokens: 9100 }, period: { requests: 1, inputTokens: 100 }, today: { requests: 1 }, month: { requests: 1 } })
    expect(result.sessions.map(row => row.id)).toEqual(['current'])
    expect(result.daily).toHaveLength(365)
    expect(result.daily.reduce((sum, day) => sum + day.metrics.requests, 0)).toBe(2)
    expect(result.options.providers).toEqual(['deepseek', 'other'])
    expect(result.options.models).toContainEqual({ provider: 'deepseek', model: 'reasoner' })
    expect(result.options.workspaces).toContainEqual({ path: '/work', title: 'Project' })
    expect(result.options.workspaces).toContainEqual({ path: '/else', title: '/else' })
    const all = aggregateUsage(data, { ...selected, days: 0 }, prices, { now })
    expect(all.sessions.map(row => row.id)).toEqual(['older', 'current'])
    expect(all.daily).toEqual(result.daily)
  })
  it('uses provider+model JSON identity rather than merging same-named models', () => {
    const result = aggregateUsage([session('one'), session('two', now, 200, 'deepseek-account')], query, prices, { now })
    expect(result.models.map(row => row.id)).toEqual([JSON.stringify(['deepseek-account', 'chat']), JSON.stringify(['deepseek', 'chat'])])
  })
  it('prices DeepSeek input misses only, exact rates per million, and separates currencies/account routes', () => {
    const one = session('one', now, 1_000_000)
    one.state.rows[0]!.usage = { inputTokens: 1_000_000, uncachedInputTokens: 800_000, outputTokens: 500_000, totalTokens: 1_500_000, cacheReadTokens: 200_000, cacheWriteTokens: 0, reasoningTokens: 100, missingOptional: [] }
    const two = session('two', now, 1_000_000, 'deepseek-account')
    two.state.rows[0]!.usage = { ...one.state.rows[0]!.usage! }
    const result = aggregateUsage([one, two], query, [...prices, { ...prices[0]!, provider: 'deepseek-account', currency: 'USD' }], { now })
    expect(result.overview.period.costs).toEqual([{ currency: 'CNY', amount: 0.4396, requests: 1 }, { currency: 'USD', amount: 0.4396, requests: 1 }])
    expect(result.overview.period.unpricedRequests).toBe(0)
  })
  it('prices both inclusive Chat and exclusive Messages input without subtracting cache twice', () => {
    const make = (totalTokens: number | undefined) => foldUsage(header, 0, log(started(now), event('assistant/message', now + 50, message({ usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 200, cacheWriteTokens: 0, ...(totalTokens === undefined ? {} : { totalTokens }) } })), ended(now + 100)))
    const exclusive = make(310)
    expect(exclusive.rows[0]?.usage?.uncachedInputTokens).toBe(100)
    expect(report(exclusive).overview.period.costs[0]?.amount).toBeCloseTo(0.0000378, 10)
    expect(report(make(undefined)).overview.period.unpricedRequests).toBe(1)
    expect(report(make(999)).overview.period.unpricedRequests).toBe(1)
    const inclusive = foldUsage(header, 0, log(started(now), event('assistant/message', now + 50, message({ usage: { inputTokens: 300, outputTokens: 10, totalTokens: 310, cacheReadTokens: 200, cacheWriteTokens: 0 } })), ended(now + 100)))
    expect(report(inclusive).overview.period.costs).toEqual(report(exclusive).overview.period.costs)
  })
  it('normalizes retry attempts independently before adding different cache semantics', () => {
    const state = foldUsage(header, 0, log(started(now), event('assistant/attempt', now + 10, { turn: 1, step: 1, stream: [{ type: 'chunk', time: now + 10, chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 10, totalTokens: 310, cacheReadTokens: 200, cacheWriteTokens: 0 } } }, { type: 'chunk', time: now + 10, chunk: { type: 'finish', reason: { kind: 'error' } } }] }), event('llm/retry-started', now + 20, { turn: 1, step: 1, retry: 1 }), event('assistant/message', now + 50, message({ usage: { inputTokens: 300, outputTokens: 10, totalTokens: 310, cacheReadTokens: 200, cacheWriteTokens: 0 } })), ended(now + 100)))
    expect(state.rows[0]?.usage?.uncachedInputTokens).toBe(200)
    expect(report(state).overview.period.costs[0]?.amount).toBeCloseTo(0.0000756, 10)
  })
  it('never invents zero costs for unknown providers, unmatched models or absent rates', () => {
    const result = aggregateUsage([session('unknown-provider', now, 100, 'other'), session('unknown-model', now, 100, 'deepseek', 'unmatched'), session('not-deepseek', now, 100, 'deepseekish')], query, [...prices, { ...prices[0]!, provider: 'other' }, { ...prices[0]!, provider: 'deepseekish' }], { now })
    expect(result.overview.period).toMatchObject({ unpricedRequests: 3, costs: [] })
  })
  it('records missing optional tokens and prices only when missing cache fields cannot change the charge', () => {
    const data = session('missing')
    data.state = foldUsage(header, 0, log(started(now), event('assistant/message', now + 50, message({ usage: { inputTokens: 100, outputTokens: 10 } })), ended(now + 100)))
    expect(data.state.rows[0]?.usage?.missingOptional).toEqual(['cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'])
    expect(aggregateUsage([data], query, prices, { now }).overview.period).toMatchObject({ unpricedRequests: 1, costs: [] })
    const sameInputRate = [{ ...prices[0]!, cacheRead: prices[0]!.input }]
    expect(aggregateUsage([data], query, sameInputRate, { now }).overview.period.unpricedRequests).toBe(1)
    expect(aggregateUsage([data], query, [{ ...sameInputRate[0]!, cacheWrite: null }], { now }).overview.period.unpricedRequests).toBe(1)
  })
  it('does not guess cache-write semantics or cache-read rates', () => {
    const data = session('write')
    data.state.rows[0]!.usage!.cacheWriteTokens = 1
    expect(aggregateUsage([data], query, [{ ...prices[0]!, cacheWrite: 0.1 }], { now }).overview.period).toMatchObject({ unpricedRequests: 1, costs: [] })
    data.state.rows[0]!.usage!.cacheWriteTokens = 0
    expect(aggregateUsage([data], query, [{ ...prices[0]!, cacheRead: null }], { now }).overview.period.unpricedRequests).toBe(1)
  })
  it('preserves partial known tokens while a missing attempt makes the full price unknown', () => {
    const state = foldUsage(header, 0, log(started(now), event('assistant/attempt', now + 10, { turn: 1, step: 1, stream: [] }), event('llm/retry-started', now + 20, { turn: 1, step: 1, retry: 1 }), event('assistant/message', now + 70, message()), ended(now + 100)))
    expect(report(state).overview.period).toMatchObject({ requests: 1, succeeded: 1, retries: 1, inputTokens: 100, missingUsage: 1, partialUsage: 1, unpricedRequests: 1, costs: [] })
  })
})
