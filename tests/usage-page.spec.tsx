// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { UsageBalance, UsageBalances, UsageProviderBalance, UsageMetrics, UsageReport } from '../src/usage/types.ts'
import { calendarDays, heatmapDayCount, parsePrices, UsagePage } from '../src/client/usage/UsagePage.tsx'
import { en, zh, type UsageKey } from '../src/client/usage/locales.ts'

const t = (key: UsageKey, args?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(args?.[k] ?? ''))
const language = () => 'en'
const metrics = (tokens = 100): UsageMetrics => ({
  requests: 1, succeeded: 1, failed: 0, cancelled: 0, retries: 0, missingUsage: 1, partialUsage: 0,
  inputTokens: tokens, outputTokens: 0, totalTokens: tokens, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
  elapsedMs: 0, timedRequests: 0, ttftMs: 0, ttftRequests: 0, decodeMs: 0, decodeTokens: 0,
  unpricedRequests: 1, costs: [],
})
function report(tokens = 100): UsageReport {
  return { generatedAt: Date.parse('2026-09-30T12:00:00Z'), query: { days: 30, timezone: 'UTC', role: 'all' },
    overview: { today: metrics(tokens), month: metrics(tokens), allTime: metrics(tokens), period: metrics(tokens), activeDays: 1, streak: 1, longestStreak: 1 },
    daily: [{ date: '2026-09-30', metrics: metrics(tokens) }],
    providers: Array.from({ length: 21 }, (_, i) => ({ id: `p${i}`, label: `Channel ${i}`, metrics: metrics(tokens) })),
    models: [], workspaces: [], sessions: [],
    options: { providers: ['deepseek-account', 'codex'], models: [{ provider: 'deepseek-account', model: 'flash' }, { provider: 'codex', model: 'gpt' }], workspaces: [] },
    coverage: { totalSessions: 2, processedSessions: 1, failedSessions: 0, inheritedEventsExcluded: 7, loading: false, from: null, errors: [] },
    prices: [], priceStorage: false,
  }
}
const balance: UsageBalance = { status: 'ready', wallets: [{ currency: 'CNY', balance: '9.97' }], bonusWallets: [{ currency: 'USD', balance: '5.61' }], checkedAt: 1_800_000_000_000, usageUrl: null }
const balances = { deepseek: balance, providers: [] }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
function setup(value = report(), providers: UsageProviderBalance[] = []) {
  const call = vi.fn(async (_channel, endpoint) => ({ ok: true, value: endpoint === 'usage/balances' ? { ...balances, providers } : value }))
  const rpc = { call } as unknown as ClientConnectionRpc
  const view = render(<UsagePage rpc={rpc} t={t} language={language} />)
  return { call, rpc, view }
}

describe('usage page', () => {
  it('renders real DTOs, separate currencies, compact heat cells, pagination and unknown sample metrics', async () => {
    const { call, view } = setup()
    await screen.findByRole('heading', { name: en.activity })
    expect(screen.getByText('CNY 9.97')).toBeTruthy()
    expect(screen.getByText('USD 5.61')).toBeTruthy()
    const walletCard = screen.getByRole('region', { name: en.balance })
    const walletHeading = within(walletCard).getByRole('heading', { name: en.balance })
    expect(walletHeading.parentElement?.tagName).toBe('DIV')
    expect(walletHeading.parentElement?.parentElement).toBe(walletCard)
    expect(walletHeading.parentElement?.nextElementSibling?.tagName).toBe('SMALL')
    expect(walletHeading.parentElement?.nextElementSibling?.textContent).toMatch(/^Checked /)
    expect(screen.getByText(t('reportedOnly', { missing: 1, partial: 0 }))).toBeTruthy()
    expect(screen.getByRole('img', { name: new RegExp(en.trend) }).querySelector('polyline')?.getAttribute('points')).toBeTruthy()
    expect(view.container.querySelectorAll('[data-level][aria-pressed]')).toHaveLength(84)
    expect(screen.queryByText(en.less)).toBeNull()
    expect(screen.queryByText(en.more)).toBeNull()
    expect(view.container.querySelectorAll('i[data-level]')).toHaveLength(0)
    expect(screen.queryByText('Channel 20')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.next }))
    expect(screen.getByText('Channel 20')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /2026-09-30: 100 tokens/ }))
    expect(screen.getByRole('heading', { name: 'Selected day: 2026-09-30' })).toBeTruthy()
    fireEvent.click(screen.getByText(en.prices))
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(inputs).toHaveLength(4)
    expect(inputs.every(input => input.disabled && input.value === '')).toBe(true)
    expect(call.mock.calls.filter(args => args[1] === 'usage/balances')).toHaveLength(1)
  })

  it('shows provider-reported account quotas/credits separately from cash and refreshes without polling', async () => {
    const provider: UsageProviderBalance = { provider: 'openai-codex', name: 'OpenAI Codex', accountId: 'work', label: 'Work', active: true, plan: 'PLUS', subscriptionUntil: 1_800_000_000_000, status: 'ready', checkedAt: 1_800_000_000_000,
      windows: [{ window: '5h', percent: 84, kind: 'remaining', resetsAt: 1_800_000_000_000 }, { window: 'weekly', percent: 92, kind: 'remaining', resetsAt: null }], credits: '5.50', unlimitedCredits: false, resetCredits: 3 }
    const { call } = setup(report(), [provider, { ...provider, provider: 'custom', name: 'Custom', accountId: null, status: 'unsupported', windows: [], credits: null, resetCredits: null, subscriptionUntil: undefined as unknown as number }])
    const section = await screen.findByRole('region', { name: en.accountBalances })
    await within(section).findByText('84% remaining')
    expect(within(section).getByText('92% remaining')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'OpenAI Codex Work' })).getByText(/Subscription active until/)).toBeTruthy()
    // A stale host may omit the field entirely; never render "Invalid Date".
    expect(within(screen.getByRole('region', { name: 'Custom Work' })).queryByText(/Subscription active until/)).toBeNull()
    expect(within(section).queryByText(/Invalid Date/)).toBeNull()
    expect(within(section).getByRole('progressbar', { name: /OpenAI Codex Work: 5h/ }).getAttribute('value')).toBe('84')
    expect(screen.getByRole('region', { name: en.balance }).getAttribute('data-provider')).toBe('deepseek')
    expect(screen.getByRole('region', { name: 'OpenAI Codex Work' }).getAttribute('data-provider')).toBe('openai-codex')
    expect(screen.getByRole('region', { name: 'Custom Work' }).getAttribute('data-provider')).toBe('custom')
    expect(within(section).getByText(en.quotaCreditsHint)).toBeTruthy()
    expect(within(section).getByText(en.quotaUnsupported)).toBeTruthy()
    expect(within(section).queryByText('USD 5.50')).toBeNull()
    expect(within(section).getByText('CNY 9.97')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: en.refresh }))
    await waitFor(() => expect(call.mock.calls.filter(args => args[1] === 'usage/balances')).toHaveLength(2))
    expect(call.mock.calls.filter(args => args[1] === 'usage/report')).toHaveLength(1)
  })
  it('simultaneously displays two accounts of the same provider with independent quota values', async () => {
    const account: UsageProviderBalance = { provider: 'google-antigravity', name: 'Google Antigravity', accountId: 'a', label: 'Account A', active: true, plan: null, subscriptionUntil: null, status: 'ready', checkedAt: 1_800_000_000_000,
      windows: [{ window: 'weekly', group: 'gemini', percent: 25, kind: 'remaining', resetsAt: null }], credits: null, unlimitedCredits: false, resetCredits: null }
    setup(report(), [account, { ...account, accountId: 'b', label: 'Account B', active: false, windows: [{ window: 'weekly', group: 'gemini', percent: 85, kind: 'remaining', resetsAt: null }] }])
    const first = await screen.findByRole('region', { name: 'Google Antigravity Account A' })
    const second = await screen.findByRole('region', { name: 'Google Antigravity Account B' })
    expect(within(first).getByText('25% remaining')).toBeTruthy()
    expect(within(first).queryByText(/Subscription active until/)).toBeNull()
    expect(within(second).getByText('85% remaining')).toBeTruthy()
    expect(within(first).getByText(en.activeAccount)).toBeTruthy()
    expect(within(second).queryByText(en.activeAccount)).toBeNull()
    expect(within(second).queryByText(en.quotaInactive)).toBeNull()
    expect(first.getAttribute('data-provider')).toBe('google-antigravity')
    expect(second.getAttribute('data-provider')).toBe(first.getAttribute('data-provider'))
  })
  it('renders the last account snapshot immediately on re-entry while refreshing in the background', async () => {
    const provider: UsageProviderBalance = { provider: 'openai-codex', name: 'OpenAI Codex', accountId: 'work', label: 'Work', active: true, plan: null, subscriptionUntil: null, status: 'ready', checkedAt: 1_800_000_000_000,
      windows: [{ window: '5h', percent: 84, kind: 'remaining', resetsAt: null }], credits: null, unlimitedCredits: false, resetCredits: null }
    const { view, rpc, call } = setup(report(), [provider])
    await screen.findByText('84% remaining')
    view.unmount()
    let finish!: (result: { ok: true; value: UsageBalances }) => void
    const pending = new Promise<{ ok: true; value: UsageBalances }>(resolve => { finish = resolve })
    call.mockImplementation(async (_channel, endpoint) => endpoint === 'usage/balances' ? pending : { ok: true, value: report() })
    render(<UsagePage rpc={rpc} t={t} language={language} />)
    const section = screen.getByRole('region', { name: en.accountBalances })
    expect(within(section).getByText('84% remaining')).toBeTruthy()
    expect(within(section).getByText('CNY 9.97')).toBeTruthy()
    expect(within(section).getByText(en.accountBalancesUpdating)).toBeTruthy()
    expect(within(section).queryByText(en.balanceLoading)).toBeNull()
    expect(within(section).getByRole('button', { name: en.updating }).hasAttribute('disabled')).toBe(true)
    await act(async () => { finish({ ok: true, value: { deepseek: { ...balance, wallets: [{ currency: 'CNY', balance: '8.50' }] }, providers: [{ ...provider, windows: [{ ...provider.windows[0]!, percent: 62 }] }] } }) })
    expect(within(section).getByText('62% remaining')).toBeTruthy()
    expect(within(section).getByText('CNY 8.50')).toBeTruthy()
    expect(within(section).queryByText('84% remaining')).toBeNull()
    expect(within(section).queryByText(en.accountBalancesUpdating)).toBeNull()
    expect(call.mock.calls.filter(args => args[1] === 'usage/balances')).toHaveLength(2)
  })
  it.each(['offline', 'invalid'])('retains cached values after an %s refresh and replaces them on successful retry', async failure => {
    const { view, rpc, call } = setup()
    await screen.findByText('CNY 9.97')
    view.unmount()
    call.mockImplementation(async (_channel, endpoint) => {
      if (endpoint !== 'usage/balances') return { ok: true, value: report() }
      if (failure === 'offline') throw new Error('offline')
      return { ok: true, value: {} } as any
    })
    render(<UsagePage rpc={rpc} t={t} language={language} />)
    await screen.findByText(en.accountBalancesFailed)
    expect(screen.getByText('CNY 9.97')).toBeTruthy()
    call.mockImplementation(async (_channel, endpoint) => ({ ok: true, value: endpoint === 'usage/balances' ? { deepseek: { ...balance, status: 'signed-out', wallets: [], bonusWallets: [] }, providers: [] } : report() }) as any)
    fireEvent.click(within(screen.getByRole('region', { name: en.accountBalances })).getByRole('button', { name: en.refresh }))
    await screen.findByText(en.signedOut)
    expect(screen.queryByText('CNY 9.97')).toBeNull()
    expect(screen.queryByText(en.accountBalancesFailed)).toBeNull()
  })
  it('never shows another connection’s snapshot and ignores late replies from an unmounted page', async () => {
    const { view, rpc, call } = setup()
    await screen.findByText('CNY 9.97')
    view.unmount()
    let finish!: (result: { ok: true; value: UsageBalances }) => void
    const pending = new Promise<{ ok: true; value: UsageBalances }>(resolve => { finish = resolve })
    call.mockImplementation(async (_channel, endpoint) => endpoint === 'usage/balances' ? pending : { ok: true, value: report() })
    const same = render(<UsagePage rpc={rpc} t={t} language={language} />)
    expect(screen.getByText('CNY 9.97')).toBeTruthy()
    same.unmount()
    await act(async () => { finish({ ok: true, value: { ...balances, deepseek: { ...balance, wallets: [{ currency: 'CNY', balance: '999' }] } } }) })
    call.mockImplementation(async (_channel, endpoint) => endpoint === 'usage/balances' ? new Promise(() => {}) : { ok: true, value: report() })
    const cached = render(<UsagePage rpc={rpc} t={t} language={language} />)
    // The cancelled reply must not have replaced the previous snapshot before effects run.
    expect(screen.getByText('CNY 9.97')).toBeTruthy()
    const otherRpc = { call: vi.fn(async (_channel, endpoint) => endpoint === 'usage/balances' ? new Promise(() => {}) : { ok: true, value: report() }) } as unknown as ClientConnectionRpc
    cached.rerender(<UsagePage rpc={otherRpc} t={t} language={language} />)
    expect(screen.queryByText('CNY 9.97')).toBeNull()
    expect(screen.queryByText('CNY 999.00')).toBeNull()
    expect(screen.getByText(en.balanceLoading)).toBeTruthy()
    expect(screen.queryByText(en.accountBalancesUpdating)).toBeNull()
  })
  it('snaps hover to the nearest date at scaled widths, shows daily data, and aligns the guide with the axis', async () => {
    const value = report(1234)
    value.daily.push({ date: '2026-09-29', metrics: { ...metrics(900), inputTokens: 600, outputTokens: 300, requests: 4, missingUsage: 0 } })
    setup(value)
    const chart = await screen.findByRole('img', { name: new RegExp(en.trend) })
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 20, width: 1600, height: 460, right: 1700, bottom: 480, x: 100, y: 20, toJSON: () => ({}) })
    // Moving off the actual point still selects its closest day, accounting for 2x SVG scale.
    fireEvent.mouseMove(chart, { clientX: 100 + 737 * 2, clientY: 20 + 100 * 2 })
    const tooltip = screen.getByRole('tooltip')
    expect(within(tooltip).getByText('2026-09-29')).toBeTruthy()
    expect(within(tooltip).getByText('900')).toBeTruthy()
    expect(within(tooltip).getByText('600')).toBeTruthy()
    expect(within(tooltip).getByText('300')).toBeTruthy()
    expect(within(tooltip).getByText('4')).toBeTruthy()
    const guide = chart.querySelector('line[y2="210"]')!
    const point = chart.querySelector('circle[r="4.5"]')!
    const axisDate = chart.querySelector('text[text-anchor="middle"]')!
    expect(Number(guide.getAttribute('x1'))).toBeCloseTo(40 + 28 * 720 / 29)
    expect(guide.getAttribute('x1')).toBe(guide.getAttribute('x2'))
    expect(point.getAttribute('cx')).toBe(guide.getAttribute('x1'))
    expect(axisDate.getAttribute('x')).toBe(guide.getAttribute('x1'))
    expect(axisDate.textContent).toBe('2026-09-29')
    fireEvent.mouseMove(chart, { clientX: 100 + 755 * 2, clientY: 20 + 120 * 2 })
    expect(within(screen.getByRole('tooltip')).getByText('2026-09-30')).toBeTruthy()
    expect(within(screen.getByRole('tooltip')).getAllByText('1,234')).toHaveLength(2)
    expect(screen.getByRole('tooltip').textContent).toContain(en.missing.split('{count}')[1])
    fireEvent.mouseMove(chart, { clientX: 100 + 10 * 2, clientY: 20 + 120 * 2 })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseMove(chart, { clientX: 100 + 755 * 2, clientY: 20 + 120 * 2 })
    fireEvent.mouseLeave(chart)
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(chart.querySelector('line[y2="210"]')).toBeNull()
    fireEvent.focus(chart)
    expect(within(screen.getByRole('tooltip')).getByText(en.dayUnknown)).toBeTruthy()
    fireEvent.keyDown(chart, { key: 'End' })
    expect(within(screen.getByRole('tooltip')).getByText('2026-09-30')).toBeTruthy()
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(within(screen.getByRole('tooltip')).getByText('2026-09-29')).toBeTruthy()
    fireEvent.keyDown(chart, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('fits square week columns to panel width and keeps dates attached to the displayed cells', async () => {
    expect(heatmapDayCount(188)).toBe(56)
    expect(heatmapDayCount(380)).toBe(112)
    expect(heatmapDayCount(620)).toBe(182)
    expect(heatmapDayCount(1000)).toBe(287)
    expect(heatmapDayCount(1900)).toBe(364)
    let resized!: ResizeObserverCallback
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resized = callback }
      observe() {}
      disconnect = disconnect
    })
    const { view } = setup()
    await screen.findByRole('heading', { name: en.activity })
    const resize = (width: number) => act(() => resized([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver))
    resize(380)
    let cells = [...view.container.querySelectorAll('[data-level][aria-pressed]')]
    expect(cells).toHaveLength(112)
    expect(cells[0]?.getAttribute('aria-label')).toContain(calendarDays('2026-09-30', 112)[0])
    expect(cells.at(-1)?.getAttribute('aria-label')).toContain('2026-09-30')
    expect(screen.queryByText(t('activityHint', { days: 112 }))).toBeNull()
    expect(screen.getByText(`${en.activeDays}: 1`)).toBeTruthy()
    expect(screen.getByText(`${en.streak}: 1`)).toBeTruthy()
    expect(screen.getByText(`${en.longestStreak}: 1`)).toBeTruthy()
    const activity = screen.getByRole('region', { name: en.activity })
    expect(activity.textContent).toContain(calendarDays('2026-09-30', 112)[0])
    expect((cells[0]?.parentElement as HTMLElement).style.gridTemplateColumns).toBe('repeat(16, 20px)')
    resize(1900)
    cells = [...view.container.querySelectorAll('[data-level][aria-pressed]')]
    expect(cells).toHaveLength(364)
    expect((cells[0]?.parentElement as HTMLElement).style.gridTemplateColumns).toBe('repeat(52, 20px)')
    resize(188)
    cells = [...view.container.querySelectorAll('[data-level][aria-pressed]')]
    expect(cells).toHaveLength(56)
    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
  it('aborts old filters and ignores stale replies even if the transport ignores abort', async () => {
    let settleFirst!: (value: { ok: true; value: UsageReport }) => void
    const first = new Promise<{ ok: true; value: UsageReport }>(resolve => { settleFirst = resolve })
    const call = vi.fn((_channel, endpoint, _payload, _signal) => endpoint === 'usage/balances'
      ? Promise.resolve({ ok: true, value: balances })
      : call.mock.calls.filter(args => args[1] === 'usage/report').length === 1 ? first : Promise.resolve({ ok: true, value: report(222) }))
    const rpc = { call } as unknown as ClientConnectionRpc
    const view = render(<UsagePage rpc={rpc} t={t} language={language} />)
    fireEvent.change(screen.getByLabelText(en.role), { target: { value: 'subagent' } })
    await screen.findByRole('heading', { name: en.activity })
    const signal = call.mock.calls.find(args => args[1] === 'usage/report')?.[3] as AbortSignal
    expect(signal.aborted).toBe(true)
    await act(async () => { settleFirst({ ok: true, value: report(999) }); await first })
    expect(screen.queryByText('999')).toBeNull()
    expect(screen.getAllByText('222').length).toBeGreaterThan(0)
    const lastSignal = call.mock.calls.filter(args => args[1] === 'usage/report').at(-1)?.[3] as AbortSignal
    view.unmount()
    expect(lastSignal.aborted).toBe(true)
  })

  it('polls reports only while visible and never polls balances', async () => {
    vi.useFakeTimers()
    let hidden = false
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
    const { call } = setup()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(call.mock.calls.filter(args => args[1] === 'usage/report')).toHaveLength(2)
    hidden = true; fireEvent(document, new Event('visibilitychange'))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(call.mock.calls.filter(args => args[1] === 'usage/report')).toHaveLength(2)
    hidden = false; fireEvent(document, new Event('visibilitychange'))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(call.mock.calls.filter(args => args[1] === 'usage/report')).toHaveLength(3)
    expect(call.mock.calls.filter(args => args[1] === 'usage/balances')).toHaveLength(1)
  })

  it('retries a failed report without discarding balance', async () => {
    let failed = true
    const call = vi.fn(async (_channel, endpoint) => {
      if (endpoint === 'usage/balances') return { ok: true, value: balances }
      if (failed) throw new Error('offline')
      return { ok: true, value: report() }
    })
    render(<UsagePage rpc={{ call } as unknown as ClientConnectionRpc} t={t} language={language} />)
    await screen.findByRole('alert')
    failed = false
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => expect(screen.getByRole('heading', { name: en.activity })).toBeTruthy())
    expect(call.mock.calls.filter(args => args[1] === 'usage/balances')).toHaveLength(1)
  })

  it('keeps calendar days and price parsing exact without inventing rates', () => {
    expect(calendarDays('2024-03-01', 3)).toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    const draft = { provider: 'deepseek-account', model: 'flash', currency: 'CNY' as const, input: '2.5', output: '3', cacheRead: '', cacheWrite: '' }
    const result = parsePrices([draft], [])
    expect(result[0]).toEqual({ provider: 'deepseek-account', model: 'flash', currency: 'CNY', input: 2.5, output: 3, cacheRead: null, cacheWrite: null })
    expect(() => parsePrices([{ ...draft, input: '-1' }], [])).toThrow()
    expect(() => parsePrices([{ ...draft, output: '' }], [])).toThrow()
    expect(parsePrices([{ ...draft, input: '', output: '' }], result)).toEqual([])
    expect(parsePrices([{ ...draft, provider: 'deepseekish' }], [])).toEqual([])
  })
})
