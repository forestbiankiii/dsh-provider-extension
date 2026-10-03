import { createServer, type Socket } from 'node:net'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReasoningEffortId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { AntigravityAdapter, ANTIGRAVITY_STREAM_ENDPOINT, ANTIGRAVITY_GENERATE_ENDPOINT, ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT } from '../src/antigravity/llm-adapter.ts'
import { createRawPrivateDispatcher } from '../src/antigravity/raw-http.ts'
import { PrivateTransportError, type PrivateTransport } from '../src/antigravity/private-transport.ts'
import { AGY_PROVIDER_USER_AGENT, DSH_ATTRIBUTION_HEADER, assertWireIdentityInvariant, createWireIdentity } from '../src/antigravity/wire-identity.ts'

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

describe('Antigravity wire identity', () => {
  it('matches the upstream CLI identity invariant and retains truthful DSH attribution', () => {
    const identity = createWireIdentity()
    const headers = identity.headers()
    expect(headers['User-Agent']).toBe(AGY_PROVIDER_USER_AGENT)
    expect(() => assertWireIdentityInvariant(headers)).not.toThrow()
    expect(headers[DSH_ATTRIBUTION_HEADER]).toBeTruthy()
    expect(headers[DSH_ATTRIBUTION_HEADER]).not.toBe(AGY_PROVIDER_USER_AGENT)
    const pairs = identity.headerPairs(ANTIGRAVITY_STREAM_ENDPOINT, { authorization: 'Bearer test', body: '{}' })
    expect(pairs.filter(([name]) => name === DSH_ATTRIBUTION_HEADER)).toEqual([[DSH_ATTRIBUTION_HEADER, headers[DSH_ATTRIBUTION_HEADER]]])
    expect(pairs.filter(([name]) => name === 'User-Agent')).toEqual([['User-Agent', AGY_PROVIDER_USER_AGENT]])
    expect(pairs.some(([name]) => name === 'Client-Metadata' || name === 'X-Goog-Api-Client')).toBe(false)
  })
})

describe('Antigravity provider failure boundaries', () => {
  it('dispatches Gemini 3.8 High without replacing it with the retired 3.5 alias', async () => {
    const request = vi.fn<PrivateTransport['request']>(async () => new Response('data: {"candidates":[{"content":{"parts":[{"text":"hello"}]},"finishReason":"STOP"}]}\n\n'))
    const chunks = await collect(adapter(request))
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0]?.[0]?.url).toBe('https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse')
    const payload = JSON.parse(String(request.mock.calls[0]?.[0]?.body))
    expect(payload.model).toBe('gemini-3.8-flash-high')
    expect(payload.request.labels.model_enum).toBe('MODEL_PLACEHOLDER_M318')
    expect(payload.request.generationConfig.thinkingConfig).toEqual({ includeThoughts: true, thinkingBudget: -1 })
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'text-delta', text: 'hello' }))
  })

  it.each([ANTIGRAVITY_STREAM_ENDPOINT, ANTIGRAVITY_GENERATE_ENDPOINT, ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT])('pins model operations to the production gateway: %s', endpoint => {
    expect(new URL(endpoint).origin).toBe('https://cloudcode-pa.googleapis.com')
  })

  it('reads the live model catalog from the same gateway as generation', async () => {
    const request = vi.fn<PrivateTransport['request']>(async () => new Response(JSON.stringify({ models: { 'gemini-3.8-flash-tiered': {} } })))
    const models = await adapter(request).listModels('google-antigravity')
    expect(request.mock.calls[0]?.[0]?.url).toBe('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels')
    expect(models.some(model => model.id === options.model)).toBe(true)
  })

  it('reports an explicit HTTP 404 without exposing the response body or substituting another model', async () => {
    const request = vi.fn(async () => new Response('private provider data', { status: 404 }))
    await expect(collect(adapter(request))).rejects.toMatchObject({
      code: 'PROTOCOL_DRIFT', failure: { status: 404 },
      message: expect.stringContaining('requested model or endpoint (HTTP 404)'),
    })
    expect(request).toHaveBeenCalledOnce()
  })

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
