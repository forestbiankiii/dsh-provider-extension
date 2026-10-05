import { describe, expect, it } from 'vitest'
import { normalizeAbortDrops, type PiAiErrorEvent } from '../src/codex/abort-normalize.ts'

// Mirror of dsh-llm-pi-ai classifyPiAiError's transport family: the normalized
// message must land in TRANSPORT so DSH's default retry policy retries it.
const TRANSPORT_FAMILY = /\b(?:network|connection|socket|fetch)\b/i

async function collect(events: AsyncIterable<PiAiErrorEvent>): Promise<PiAiErrorEvent[]> {
  const out: PiAiErrorEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

function one(event: PiAiErrorEvent, options?: { signal?: AbortSignal }): Promise<PiAiErrorEvent[]> {
  return collect(normalizeAbortDrops((async function* () { yield event })(), options))
}

describe('codex transport abort normalization', () => {
  it('re-labels a bare transport abort so DSH retries it', async () => {
    for (const errorMessage of ['aborted', 'AbortError: This operation was aborted', 'Request was aborted']) {
      const [event] = await one({ type: 'error', error: { stopReason: 'error', errorMessage } })
      expect(event.error?.errorMessage).toBe(`connection aborted before the response completed: ${errorMessage}`)
      expect(TRANSPORT_FAMILY.test(event.error?.errorMessage ?? '')).toBe(true)
    }
  })

  it('leaves caller cancellation alone', async () => {
    const controller = new AbortController()
    controller.abort()
    const [cancelledBySignal] = await one({ type: 'error', error: { stopReason: 'error', errorMessage: 'aborted' } }, { signal: controller.signal })
    expect(cancelledBySignal.error?.errorMessage).toBe('aborted')
    const [markedAborted] = await one({ type: 'error', error: { stopReason: 'aborted', errorMessage: 'pi-ai stream aborted' } })
    expect(markedAborted.error?.errorMessage).toBe('pi-ai stream aborted')
  })

  it('leaves non-abort failures and other events untouched', async () => {
    const overloaded = 'Codex error: Our servers are currently overloaded. Please try again later.'
    const [error] = await one({ type: 'error', error: { stopReason: 'error', errorMessage: overloaded } })
    expect(error.error?.errorMessage).toBe(overloaded)
    const done = { type: 'done', message: { stopReason: 'stop' } }
    expect(await one(done as PiAiErrorEvent)).toEqual([done])
  })
})
