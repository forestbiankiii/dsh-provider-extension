/** A profile-wide, secret-free usage page. The Host owns aggregation and persistence. */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageBalance, UsageBalances, UsageDaily, UsageMetrics, UsagePrice, UsageQuery, UsageReport } from '../../usage/types.ts'
import type { UsageKey } from './locales.ts'
import css from './UsagePage.module.css'
import { ProviderBalances } from './ProviderBalances.tsx'
import { AccountCards } from './AccountCards.tsx'

export interface UsagePageProps { rpc: ClientConnectionRpc; t: Translate<UsageKey>; language: () => string }
const deepseek = (provider: string) => /^deepseek(?:$|[-_/:.])/i.test(provider)
const ranges = [7, 30, 90, 365, 0] as const
// Only public DTOs, one last snapshot per connection. Survives navigation, not browser reload.
const lastBalances = new WeakMap<ClientConnectionRpc, UsageBalances>()

async function call<T>(rpc: ClientConnectionRpc, endpoint: string, payload: unknown, signal: AbortSignal): Promise<T> {
  const result = await rpc.call('/api', endpoint, payload, signal)
  if (!result.ok) throw new Error(result.error.message)
  if (result.value === null || typeof result.value !== 'object') throw new Error('Invalid usage response')
  return result.value as T
}

/** Calendar dates rather than 24-hour offsets keep the heatmap correct across DST. */
export function calendarDays(end: string, count: number): string[] {
  const date = new Date(`${end}T12:00:00Z`)
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(date)
    day.setUTCDate(day.getUTCDate() - count + 1 + i)
    return day.toISOString().slice(0, 10)
  })
}
// Fixed 20px squares, at least 4px gaps. Fit more weekly columns, within the 365-day report window.
export function heatmapDayCount(width: number): number {
  return Math.max(4, Math.min(52, Math.floor((width + 4) / 24))) * 7
}
function dateInZone(time: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time)
  const value = (type: string) => parts.find(part => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function UsagePage({ rpc, t, language }: UsagePageProps) {
  const locale = language() === 'zh' ? 'zh-CN' : 'en-US'
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const [query, setQuery] = useState<UsageQuery>({ days: 30, timezone, role: 'all' })
  const [report, setReport] = useState<UsageReport | null>(null)
  const [options, setOptions] = useState<UsageReport['options']>({ providers: [], models: [], workspaces: [] })
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const [balanceRevision, setBalanceRevision] = useState(0)
  const [balanceSnapshot, setBalanceSnapshot] = useState<{ rpc: ClientConnectionRpc; value: UsageBalances | undefined }>(() => ({ rpc, value: lastBalances.get(rpc) }))
  const accountData = balanceSnapshot.rpc === rpc ? balanceSnapshot.value : lastBalances.get(rpc)
  const balance = accountData?.deepseek
  const providerBalances = accountData?.providers ?? []
  const [balancePending, setBalancePending] = useState(false)
  const [balanceError, setBalanceError] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [rank, setRank] = useState<'providers' | 'models' | 'workspaces' | 'sessions'>('providers')
  const [page, setPage] = useState(0)
  const queryKey = JSON.stringify(query)
  const heatViewport = useRef<HTMLDivElement>(null)
  const [heatCount, setHeatCount] = useState(84)
  const hasReport = report !== null
  useEffect(() => {
    const element = heatViewport.current
    if (!element) return
    const resize = (width: number) => { if (width > 0) setHeatCount(heatmapDayCount(width)) }
    resize(element.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => { if (entries[0]) resize(entries[0].contentRect.width) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasReport])

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let request: AbortController | undefined
    setReport(null); setError(false); setPage(0); setSelectedDate(null)
    const read = async () => {
      if (disposed || document.hidden) return
      request?.abort(); request = new AbortController()
      const current = request
      setPending(true)
      let delay = 15_000
      try {
        const value = await call<UsageReport>(rpc, 'usage/report', query, current.signal)
        if (disposed || current.signal.aborted) return
        if (!value.overview || !Array.isArray(value.daily) || !value.coverage || !value.options || !Array.isArray(value.sessions)) throw new Error('Invalid usage report')
        setReport(value); setOptions(value.options); setError(false)
        delay = value.coverage.loading ? 3_000 : 15_000
      } catch {
        if (!disposed && !current.signal.aborted) setError(true)
      } finally {
        if (!disposed && !current.signal.aborted) {
          setPending(false)
          timer = setTimeout(() => { void read() }, delay)
        }
      }
    }
    const visibility = () => {
      clearTimeout(timer)
      request?.abort()
      if (document.hidden) setPending(false)
      else void read()
    }
    document.addEventListener('visibilitychange', visibility)
    void read()
    return () => { disposed = true; clearTimeout(timer); request?.abort(); document.removeEventListener('visibilitychange', visibility) }
  }, [rpc, queryKey, revision]) // The serialized query changes only when an actual filter changes.

  useEffect(() => {
    const request = new AbortController()
    let started = false
    const read = async () => {
      if (started || document.hidden) return
      started = true; setBalancePending(true); setBalanceError(false)
      try {
        const value = await call<UsageBalances>(rpc, 'usage/balances', {
          version: 'dsh-provider-extension/0.8.1', locale: language() === 'zh' ? 'zh-CN' : 'en-US', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        }, request.signal)
        if (!request.signal.aborted) {
          if (!value.deepseek || !Array.isArray(value.deepseek.wallets) || !Array.isArray(value.deepseek.bonusWallets) || !Array.isArray(value.providers)) throw new Error('Invalid balance response')
          lastBalances.set(rpc, value)
          setBalanceSnapshot({ rpc, value })
        }
      } catch { if (!request.signal.aborted) setBalanceError(true) }
      finally { if (!request.signal.aborted) setBalancePending(false) }
    }
    void read()
    document.addEventListener('visibilitychange', read)
    return () => { request.abort(); document.removeEventListener('visibilitychange', read) }
  }, [rpc, balanceRevision])

  const refresh = () => { setRevision(value => value + 1); setBalanceRevision(value => value + 1) }
  const filter = (key: 'provider' | 'model' | 'workspace', value: string) => {
    setQuery(current => {
      const next = { ...current }
      if (value) next[key] = value
      else delete next[key]
      if (key === 'provider') delete next.model
      return next
    })
  }
  const endDate = dateInZone(report?.generatedAt ?? Date.now(), timezone)
  const heatDays = calendarDays(endDate, heatCount)
  const days = calendarDays(endDate, query.days || 365)
  const daily = new Map(report?.daily.map(day => [day.date, day]))
  const maximum = Math.max(1, ...heatDays.map(date => daily.get(date)?.metrics.totalTokens ?? 0))
  const selected = selectedDate ? daily.get(selectedDate) : undefined
  const metrics = report?.overview.period
  const money = (metrics: UsageMetrics | undefined) => metrics?.costs.length
    ? metrics.costs.map(cost => `${cost.currency} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(cost.amount)}`).join(' · ')
    : t('unknown')
  const average = (sum: number | undefined, count: number | undefined) => sum !== undefined && count ? t('seconds', { value: number(sum / count / 1000) }) : t('unknown')
  const rows = report?.[rank] ?? []
  const pages = Math.max(1, Math.ceil(rows.length / 20))
  const safePage = Math.min(page, pages - 1)
  const wallet = (values: UsageBalance['wallets'] | undefined) => values?.length ? values.map(value => `${value.currency} ${Number.isFinite(Number(value.balance)) ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value.balance)) : value.balance}`).join(' · ') : t('unknown')
  const modelOptions = options.models.filter(model => !query.provider || model.provider === query.provider)
  const balanceStatus = balanceError ? 'balanceFailed' : balance?.status === 'signed-out' ? 'signedOut' : balance?.status === 'failed' ? 'balanceFailed' : 'balanceUnavailable'

  return <section className={css.page} aria-label={t('title')}>
    <header className={css.header}><div><h1>{t('title')}</h1><p>{t('intro')}</p></div><button type="button" onClick={refresh}>{pending ? t('updating') : t('refresh')}</button></header>
    <div className={css.filters}>
      <label>{t('range')}<select value={query.days} onChange={event => setQuery(current => ({ ...current, days: Number(event.target.value) as UsageQuery['days'] }))}>{ranges.map(value => <option key={value} value={value}>{t(value === 0 ? 'all' : `days${value}`)}</option>)}</select></label>
      <label>{t('provider')}<select value={query.provider ?? ''} onChange={event => filter('provider', event.target.value)}><option value="">{t('all')}</option>{options.providers.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{t('model')}<select value={query.model ?? ''} onChange={event => filter('model', event.target.value)}><option value="">{t('all')}</option>{[...new Set(modelOptions.map(value => value.model))].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{t('workspace')}<select value={query.workspace ?? ''} onChange={event => filter('workspace', event.target.value)}><option value="">{t('all')}</option>{options.workspaces.map(value => <option key={value.path} value={value.path}>{value.title || value.path}</option>)}</select></label>
      <label>{t('role')}<select value={query.role} onChange={event => setQuery(current => ({ ...current, role: event.target.value as UsageQuery['role'] }))}>{(['all', 'main', 'subagent'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
    </div>
    {error && <div className={css.error} role="alert">{t('loadFailed')} <button type="button" onClick={() => setRevision(value => value + 1)}>{t('retry')}</button></div>}
    {!report && !error && <p role="status">{t('loading')}</p>}
    <div className={css.cards}>
      {(['today', 'month', 'allTime'] as const).map((key, index) => <div className={css.card} key={key}><span>{t((['today', 'month', 'lifetime'] as const)[index]!)}</span><strong>{report ? number(report.overview[key].totalTokens) : t('unknown')}</strong><small>{t('tokens')}</small></div>)}
      <div className={css.card} title={t('stepsHint')}><span>{t('steps')}</span><strong>{metrics ? number(metrics.requests) : t('unknown')}</strong><small>{t('stepsHint')}</small></div>
    </div>
    {report && <div className={css.warning} role="status"><p>{t('reportedOnly', { missing: number(report.overview.allTime.missingUsage), partial: number(report.overview.allTime.partialUsage) })}</p>{report.coverage.loading && <p>{t('indexing', { done: number(report.coverage.processedSessions), total: number(report.coverage.totalSessions) })}</p>}{report.coverage.failedSessions > 0 && <p>{t('failedArchives', { count: number(report.coverage.failedSessions) })}</p>}</div>}
    <section className={css.panel} aria-label={t('accountBalances')}>
      <div className={css.sectionHeading}><h2>{t('accountBalances')}</h2><button type="button" disabled={balancePending} onClick={() => setBalanceRevision(value => value + 1)}>{t(balancePending ? 'updating' : 'refresh')}</button></div>
      <p>{t('accountBalancesHint')}</p>
      {balancePending && accountData && <p role="status">{t('accountBalancesUpdating')}</p>}
      <AccountCards t={t} cards={[
        { id: 'deepseek', label: t('balance'), content: <section className={css.accountBalanceCard} data-provider="deepseek" aria-label={t('balance')}>
          <div className={css.accountHeading}><h3>{t('balance')}</h3></div>{balance?.checkedAt ? <small>{t('checked', { time: new Date(balance.checkedAt).toLocaleString(locale) })}</small> : null}
          <div className={css.balance}><div><span>{t('recharge')}</span><strong>{balance?.status === 'ready' ? wallet(balance.wallets) : t('unknown')}</strong></div><div><span>{t('bonus')}</span><strong>{balance?.status === 'ready' ? wallet(balance.bonusWallets) : t('unknown')}</strong></div></div>
          {balancePending && !accountData ? <p role="status">{t('balanceLoading')}</p> : balance?.status !== 'ready' || balanceError ? <p role="status">{t(balanceStatus)}</p> : null}<p>{t('balanceHint')}</p>
        </section> },
        ...providerBalances.map(provider => ({ id: `${provider.provider}/${provider.accountId ?? ''}`, label: provider.accountId ? `${provider.name} · ${provider.label}` : provider.name,
          content: <ProviderBalances providers={[provider]} t={t} locale={locale} /> })),
      ]} />
      {balanceError && <p role="status">{t('accountBalancesFailed')}</p>}
    </section>
    {report && <>
      <section className={css.panel} aria-label={t('activity')}><h2>{t('activity')}</h2>
        <div className={css.heatScroll} ref={heatViewport}><div className={css.heatCalendar}><div className={css.heatmap} style={{ gridTemplateColumns: `repeat(${heatCount / 7}, 20px)` }}>{heatDays.map(date => {
          const day = daily.get(date)
          const tokens = day?.metrics.totalTokens ?? 0
          const level = tokens === 0 ? 0 : Math.max(1, Math.ceil(tokens / maximum * 4))
          const label = t('dayTitle', { date, tokens: number(tokens), steps: number(day?.metrics.requests ?? 0) })
          return <button type="button" key={date} className={css.heatCell} data-level={level} aria-label={label} title={label} aria-pressed={selectedDate === date} onClick={() => setSelectedDate(selectedDate === date ? null : date)} />
        })}</div><div className={css.heatDates}><span>{heatDays[0]}</span><span>{heatDays.at(-1)}</span></div></div></div>
        <div className={css.inlineMetrics}><span>{t('activeDays')}: {number(report.overview.activeDays)}</span><span>{t('streak')}: {number(report.overview.streak)}</span><span>{t('longestStreak')}: {number(report.overview.longestStreak)}</span></div>
        {selectedDate && <div className={css.selectedDay}><div className={css.sectionHeading}><h3>{t('selectedDay', { date: selectedDate })}</h3><button type="button" onClick={() => setSelectedDate(null)}>{t('closeDay')}</button></div>{selected ? <div className={css.inlineMetrics}><span>{t('tokens')}: {number(selected.metrics.totalTokens)}</span><span title={t('stepsHint')}>{t('steps')}: {number(selected.metrics.requests)}</span><span>{t('input')}: {number(selected.metrics.inputTokens)}</span><span>{t('output')}: {number(selected.metrics.outputTokens)}</span><span>{t('cost')}: {money(selected.metrics)}</span></div> : <p>{t('dayUnknown')}</p>}</div>}
      </section>
      <section className={css.panel} aria-label={t('trend')}><h2>{t('trend')}</h2>{query.days === 0 && <p>{t('yearOnly')}</p>}<Trend days={days} daily={daily} t={t} number={number} /><div className={css.inlineMetrics}>{(['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'] as const).map((key, i) => <span key={key}>{t(key)}: {number([metrics!.inputTokens, metrics!.outputTokens, metrics!.cacheReadTokens, metrics!.cacheWriteTokens, metrics!.reasoningTokens][i]!)}</span>)}</div></section>
      <section className={css.panel} aria-label={t('performance')}><h2>{t('performance')}</h2><div className={css.metricGrid}>
        <Metric label={t('average')} value={average(metrics?.elapsedMs, metrics?.timedRequests)} /><Metric label={t('ttft')} value={average(metrics?.ttftMs, metrics?.ttftRequests)} /><Metric label={t('speed')} value={metrics?.decodeMs && metrics.decodeTokens ? t('tokPerSecond', { value: number(metrics.decodeTokens / metrics.decodeMs * 1000) }) : t('unknown')} />
        <Metric label={t('failureRate')} value={metrics?.requests ? `${number(metrics.failed / metrics.requests * 100)}%` : t('unknown')} /><Metric label={t('failures')} value={number(metrics!.failed)} /><Metric label={t('retries')} value={number(metrics!.retries)} /><Metric label={t('cancelled')} value={number(metrics!.cancelled)} />
      </div></section>
      <section className={css.panel} aria-label={t('estimates')}><h2>{t('estimates')}</h2><strong className={css.cost}>{money(metrics)}</strong><p>{t('costHint')}</p><p>{t('unpriced', { count: number(metrics!.unpricedRequests) })}</p>{metrics!.costs.map(cost => <small key={cost.currency}>{cost.currency}: {t('pricedSteps', { count: number(cost.requests) })} </small>)}</section>
      <section className={css.panel} aria-label={t('ranks')}><h2>{t('ranks')}</h2><div className={css.tabs}>{(['providers', 'models', 'workspaces', 'sessions'] as const).map(value => <button type="button" key={value} aria-pressed={rank === value} onClick={() => { setRank(value); setPage(0) }}>{t(value)}</button>)}</div>
        <div className={css.tableScroll}><table><caption className={css.srOnly}>{t(rank)}</caption><thead><tr><th scope="col">{t('name')}</th><th scope="col">{t('tokens')}</th><th scope="col" title={t('stepsHint')}>{t('steps')}</th><th scope="col">{t('cost')}</th></tr></thead><tbody>{rows.slice(safePage * 20, safePage * 20 + 20).map(row => <tr key={row.id}><th scope="row" title={row.id}>{row.label || row.id}{row.provider && <small className={css.rowDetail}>{row.provider}</small>}</th><td>{number(row.metrics.totalTokens)}</td><td>{number(row.metrics.requests)}</td><td>{money(row.metrics)}</td></tr>)}{!rows.length && <tr><td colSpan={4}>{t('noRows')}</td></tr>}</tbody></table></div>
        <div className={css.pagination}><button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>{t('previous')}</button><span>{t('page', { page: safePage + 1, pages })}</span><button type="button" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>{t('next')}</button></div>
      </section>
      <section className={css.panel} aria-label={t('coverage')}><h2>{t('coverage')}</h2><p role="status">{t(report.coverage.loading ? 'indexing' : 'indexed', { done: number(report.coverage.processedSessions), total: number(report.coverage.totalSessions) })}</p>{report.coverage.loading && <progress max={Math.max(1, report.coverage.totalSessions)} value={report.coverage.processedSessions} aria-label={t('coverage')} />}<p>{t('missing', { count: number(metrics!.missingUsage) })}</p>{metrics!.partialUsage > 0 && <p>{t('partial', { count: number(metrics!.partialUsage) })}</p>}<p>{t('inherited', { count: number(report.coverage.inheritedEventsExcluded) })}</p>{report.coverage.from !== null && <p>{t('historyFrom', { date: new Date(report.coverage.from).toLocaleDateString(locale) })}</p>}
        {report.coverage.failedSessions > 0 && <p className={css.warning}>{t('failedArchives', { count: number(report.coverage.failedSessions) })}</p>}{report.coverage.errors.length > 0 && <details><summary>{t('readErrors')}</summary><div className={css.tableScroll}><table><thead><tr><th scope="col">{t('archive')}</th><th scope="col">{t('reason')}</th></tr></thead><tbody>{report.coverage.errors.slice(0, 20).map(row => <tr key={row.sessionId}><td>{row.sessionId}</td><td>{row.reason}</td></tr>)}</tbody></table></div></details>}<small>{t('updated', { time: new Date(report.generatedAt).toLocaleString(locale) })}</small>
      </section>
      <PriceEditor report={report} rpc={rpc} t={t} onSaved={() => setRevision(value => value + 1)} />
    </>}
  </section>
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function Trend({ days, daily, t, number }: { days: string[]; daily: Map<string, UsageDaily>; t: Translate<UsageKey>; number: (n: number) => string }) {
  const id = useId()
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...days.map(date => daily.get(date)?.metrics.totalTokens ?? 0))
  const x = (i: number) => 40 + i * 720 / Math.max(1, days.length - 1)
  const y = (date: string) => 190 - (daily.get(date)?.metrics.totalTokens ?? 0) / max * 160
  const points = days.map((date, i) => `${x(i)},${y(date)}`).join(' ')
  const index = active === null ? null : Math.min(active, days.length - 1)
  const date = index === null ? undefined : days[index]
  const selected = date ? daily.get(date)?.metrics : undefined
  const anchor = index === null ? 0 : x(index)
  return <div className={css.trendWrap}>
    <svg className={css.trend} viewBox="0 0 800 230" role="img" tabIndex={0} aria-labelledby={`${id}-title ${id}-desc`} aria-describedby={date ? `${id}-tooltip` : undefined}
      onMouseMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (!bounds.width || !bounds.height) return
        const px = (event.clientX - bounds.left) * 800 / bounds.width
        const py = (event.clientY - bounds.top) * 230 / bounds.height
        if (px < 40 || px > 760 || py < 30 || py > 190) { setActive(null); return }
        setActive(Math.max(0, Math.min(days.length - 1, Math.round((px - 40) / 720 * (days.length - 1)))))
      }} onMouseLeave={() => setActive(null)} onFocus={() => setActive(0)} onBlur={() => setActive(null)}
      onKeyDown={event => {
        if (event.key === 'Escape') setActive(null)
        else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : (index ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)
          setActive(Math.max(0, Math.min(days.length - 1, next)))
        }
      }}>
      <title id={`${id}-title`}>{t('trend')}</title><desc id={`${id}-desc`}>{t('trendDescription', { from: days[0], to: days.at(-1) })} {t('trendHoverHint')}</desc>
      {[0, 1, 2, 3, 4].map(i => <line className={css.gridLine} key={i} x1="40" x2="760" y1={30 + i * 40} y2={30 + i * 40} />)}
      <polyline className={css.line} points={points} fill="none" />
      {days.map((date, i) => <circle key={date} cx={x(i)} cy={y(date)} r={days.length <= 30 ? 3 : 1.5} />)}
      {date && <g className={css.trendGuide} aria-hidden="true">
        <line className={css.crosshair} x1={anchor} x2={anchor} y1="30" y2="210" vectorEffect="non-scaling-stroke" />
        <circle className={css.activePoint} cx={anchor} cy={y(date)} r="4.5" vectorEffect="non-scaling-stroke" />
        <rect className={css.axisDate} x={anchor - 42} y="207" width="84" height="19" rx="4" />
        <text x={anchor} y="220" textAnchor="middle">{date}</text>
      </g>}
      {!date && <><text x="40" y="220">{days[0]}</text><text x="760" y="220" textAnchor="end">{days.at(-1)}</text></>}
      <text x="40" y="20">{number(max)}</text>
    </svg>
    {date && <div id={`${id}-tooltip`} role="tooltip" className={css.trendTooltip} style={{ left: `clamp(8px, calc(${anchor / 8}% ${anchor > 400 ? '- 232px' : '+ 12px'}), calc(100% - 228px))` }}>
      <strong>{date}</strong>
      {selected && selected.requests > 0 ? <><dl>{([
        ['tokens', selected.totalTokens], ['steps', selected.requests], ['input', selected.inputTokens], ['output', selected.outputTokens],
        ['cacheRead', selected.cacheReadTokens], ['cacheWrite', selected.cacheWriteTokens], ['reasoning', selected.reasoningTokens],
      ] as const).map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{number(value)}</dd></div>)}</dl>
        {selected.missingUsage > 0 && <small>{t('missing', { count: number(selected.missingUsage) })}</small>}
        {selected.partialUsage > 0 && <small>{t('partial', { count: number(selected.partialUsage) })}</small>}
      </> : <small>{t('dayUnknown')}</small>}
    </div>}
  </div>
}

type Draft = { provider: string; model: string; currency: 'CNY' | 'USD'; input: string; output: string; cacheRead: string; cacheWrite: string }
function priceDrafts(report: UsageReport): Draft[] {
  const models = new Map(report.options.models.filter(row => deepseek(row.provider)).map(row => [JSON.stringify([row.provider, row.model]), row]))
  report.prices.filter(row => deepseek(row.provider)).forEach(row => models.set(JSON.stringify([row.provider, row.model]), row))
  return [...models.values()].map(row => {
    const price = report.prices.find(price => price.provider === row.provider && price.model === row.model)
    return { provider: row.provider, model: row.model, currency: price?.currency ?? 'CNY', input: price ? String(price.input) : '', output: price ? String(price.output) : '', cacheRead: price?.cacheRead == null ? '' : String(price.cacheRead), cacheWrite: price?.cacheWrite == null ? '' : String(price.cacheWrite) }
  })
}
export function parsePrices(drafts: Draft[], existing: UsagePrice[]): UsagePrice[] {
  const prices = existing.filter(price => !deepseek(price.provider))
  const parse = (value: string): number => {
    if (!value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('Invalid rate')
    return Number(value)
  }
  for (const row of drafts) {
    if (!deepseek(row.provider)) continue
    if (!row.input.trim() && !row.output.trim()) continue
    prices.push({ provider: row.provider, model: row.model, currency: row.currency, input: parse(row.input), output: parse(row.output), cacheRead: row.cacheRead.trim() ? parse(row.cacheRead) : null, cacheWrite: row.cacheWrite.trim() ? parse(row.cacheWrite) : null })
  }
  return prices
}
function PriceEditor({ report, rpc, t, onSaved }: { report: UsageReport; rpc: ClientConnectionRpc; t: Translate<UsageKey>; onSaved: () => void }) {
  const [drafts, setDrafts] = useState(() => priceDrafts(report))
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'invalid' | 'failed'>('idle')
  const [request, setRequest] = useState<AbortController | null>(null)
  const signature = JSON.stringify([report.options.models, report.prices])
  useEffect(() => { if (!dirty) setDrafts(priceDrafts(report)) }, [signature, dirty])
  useEffect(() => () => { request?.abort() }, [request])
  const save = async () => {
    if (!report.priceStorage || status === 'saving') return
    let prices: UsagePrice[]
    try { prices = parsePrices(drafts, report.prices) } catch { setStatus('invalid'); return }
    const controller = new AbortController(); setRequest(controller); setStatus('saving')
    try {
      await call<{ prices: UsagePrice[] }>(rpc, 'usage/prices', { prices }, controller.signal)
      if (!controller.signal.aborted) { setDirty(false); setStatus('saved'); onSaved() }
    } catch { if (!controller.signal.aborted) setStatus('failed') }
  }
  return <details className={css.panel}><summary>{t('prices')}</summary><p>{t('pricesHint')}</p><p>{t('removeHint')}</p>{!report.priceStorage && <p className={css.warning}>{t('priceStorage')}</p>}{!drafts.length ? <p>{t('noPriceModels')}</p> : <form onSubmit={event => { event.preventDefault(); void save() }}><div className={css.tableScroll}><table><thead><tr><th scope="col">{t('model')}</th><th scope="col">{t('currency')}</th>{(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead><tbody>{drafts.map((row, i) => <tr key={JSON.stringify([row.provider, row.model])}><th scope="row">{row.model}<small className={css.rowDetail}>{row.provider}</small></th><td><select aria-label={t('priceInput', { provider: row.provider, model: row.model, field: t('currency') })} value={row.currency} disabled={!report.priceStorage || status === 'saving'} onChange={event => { setDirty(true); setStatus('idle'); setDrafts(current => current.map((row, index) => index === i ? { ...row, currency: event.target.value as 'CNY' | 'USD' } : row)) }}><option value="CNY">{t('cny')}</option><option value="USD">{t('usd')}</option></select></td>{(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map(key => <td key={key}><input type="number" min="0" step="any" value={row[key]} disabled={!report.priceStorage || status === 'saving'} aria-label={t('priceInput', { provider: row.provider, model: row.model, field: t(key) })} onChange={event => { const value = event.target.value; setDirty(true); setStatus('idle'); setDrafts(current => current.map((row, index) => index === i ? { ...row, [key]: value } : row)) }} /></td>)}</tr>)}</tbody></table></div><button type="submit" disabled={!report.priceStorage || status === 'saving' || !dirty}>{t(status === 'saving' ? 'saving' : 'save')}</button>{status === 'saved' && <p role="status">{t('saved')}</p>}{(status === 'invalid' || status === 'failed') && <p role="alert" className={css.error}>{t(status === 'invalid' ? 'priceInvalid' : 'priceFailed')}</p>}</form>}</details>
}
