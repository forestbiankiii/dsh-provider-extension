import { createServer, type Socket } from 'node:net'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReasoningEffortId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { AntigravityAdapter, ANTIGRAVITY_STREAM_ENDPOINT } from '../src/antigravity/llm-adapter.ts'
import { createRawPrivateDispatcher } from '../src/antigravity/raw-http.ts'
import { PrivateTransportError, type PrivateTransport } from '../src/antigravity/private-transport.ts'

const options: GenerateOptions = {
  provider: 'google-antigravity', model: 'antigravity-gemini-3.8-flash',
  reasoningEffort: ReasoningEffortId('high'),
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
}
const capacity = {
  error: { code: 503, status: 'UNAVAILABLE', message: 'No capacity available for model gemini-3.8-flash-high on the server' },
}
function adapter(request: PrivateTransport['request']) {
  return new AntigravityAdapter({
    auth: { credential: async () => ({ accessToken: 'test', refreshToken: 'test', expiresAt: Date.now() + 60_000, projectId: 'project' }) },
    transport: { request },
  })
}
async function collect(value: AntigravityAdapter, chunks: StreamChunk[] = []) {
  for await (const chunk of value.stream(options)) chunks.push(chunk)
  return chunks
}
afterEach(() => vi.unstubAllEnvs())

describe('Antigravity provider failure boundaries', () => {
  it.each(['json', 'sse'])('recognizes a real capacity refusal (%s) without resending generation', async format => {
    const json = JSON.stringify(capacity)
    const request = vi.fn(async () => new Response(format === 'sse' ? `data: ${json}\n\n` : json, {
      status: 503, headers: { 'content-type': 'text/event-stream' },
    }))
    await expect(collect(adapter(request))).rejects.toMatchObject({
      code: 'MODEL_CAPACITY_EXHAUSTED', failure: { status: 503 },
      message: expect.stringContaining('not an account quota error'),
    })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each([
    '<html>Bad gateway; user@example.com secret-token</html>',
    '{"error":',
    JSON.stringify({ text: capacity.error.message }),
    JSON.stringify({ error: { ...capacity.error, code: 400 } }),
    JSON.stringify({ error: { ...capacity.error, status: 'RESOURCE_EXHAUSTED' } }),
    JSON.stringify({ error: { ...capacity.error, message: 'No capacity available for model other-model on the server' } }),
    'x'.repeat(70 * 1024),
  ])('keeps unknown/invalid 503 bodies private and does not retry (%#)', async body => {
    const request = vi.fn(async () => new Response(body, { status: 503 }))
    await expect(collect(adapter(request))).rejects.toMatchObject({
      code: 'UPSTREAM', failure: { status: 503 },
      message: 'Antigravity upstream service is temporarily unavailable (HTTP 503); please retry later.',
    })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not classify an incomplete error stream as a confirmed capacity refusal', async () => {
    let reads = 0
    const request = vi.fn(async () => new Response(new ReadableStream({
      pull(controller) {
        if (reads++ === 0) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(capacity)}\n\n`))
        else controller.error(new Error('truncated error stream'))
      },
    }, { highWaterMark: 0 }), { status: 503 }))
    await expect(collect(adapter(request))).rejects.toMatchObject({ code: 'UPSTREAM', failure: { status: 503 } })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps quota failures distinct from capacity failures', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(capacity), { status: 429 }))
    await expect(collect(adapter(request))).rejects.toMatchObject({ code: 'RATE_LIMIT', failure: { status: 429 } })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each(['offline', 'timeout'] as const)('reports %s without resending an uncertain request', async code => {
    const request = vi.fn(async () => { throw new PrivateTransportError(code, 'private transport detail') })
    await expect(collect(adapter(request))).rejects.toMatchObject({
      code: code === 'offline' ? 'NETWORK' : 'TIMEOUT',
      message: expect.stringContaining('not automatically retried'),
    })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('never retries a network failure after streaming text', async () => {
    let reads = 0
    const request = vi.fn(async () => new Response(new ReadableStream({
      pull(controller) {
        if (reads++ === 0) controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}\n\n'))
        else controller.error(new Error('connection reset'))
      },
    }, { highWaterMark: 0 })))
    const chunks: StreamChunk[] = []
    await expect(collect(adapter(request), chunks)).rejects.toMatchObject({ code: 'NETWORK' })
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'text-delta', text: 'hello' }))
    expect(request).toHaveBeenCalledTimes(1)
  })
})

describe('Antigravity proxy disconnects', () => {
  it.each(['', 'HTTP/1.1 200 Connection established\r\n'])('reports a proxy closing before complete CONNECT headers as network, not timeout (%#)', async partialHead => {
    const sockets = new Set<Socket>()
    let connections = 0
    const server = createServer(socket => {
      connections++
      sockets.add(socket)
      socket.on('error', () => {})
      socket.once('close', () => sockets.delete(socket))
      socket.once('data', () => socket.end(partialHead))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('No loopback listener')
    vi.stubEnv('HTTPS_PROXY', `http://127.0.0.1:${address.port}`)
    vi.stubEnv('NO_PROXY', '')
    try {
      await expect(createRawPrivateDispatcher()({
        url: ANTIGRAVITY_STREAM_ENDPOINT, accessToken: 'test', body: '{}', responseHeaderTimeoutMs: 300,
      })).rejects.toMatchObject({ code: 'offline', accepted: false })
      expect(connections).toBe(1)
    } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
