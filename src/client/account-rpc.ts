import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'

const endpointPattern = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/

/** Call the plugin's existing authenticated /api routes when client connection is not mounted. */
export const accountRpcFallback: ClientConnectionRpc = {
  async call(channel, endpoint, payload, signal) {
    if (channel !== '/api' || !endpointPattern.test(endpoint)) {
      throw new Error('Invalid account RPC target')
    }
    const rpcId = crypto.randomUUID()
    const response = await fetch(new URL(`${channel}/${endpoint}`, location.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload }),
      ...(signal === undefined ? {} : { signal }),
    })
    if (!response.ok) throw new Error(`Account RPC transport failed: HTTP ${response.status}`)
    const envelope: unknown = await response.json()
    if (!isRecord(envelope) || envelope.type !== 'server-response' || envelope.rpcId !== rpcId) {
      throw new Error('Invalid account RPC response')
    }
    const result = envelope.result
    if (!isRecord(result)) throw new Error('Invalid account RPC result')
    if (result.ok === true) return { ok: true, value: result.value }
    if (result.ok === false && isRecord(result.error)
      && typeof result.error.code === 'string' && typeof result.error.message === 'string'
      && isRecord(result.error.details)) {
      return { ok: false, error: {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
      } }
    }
    throw new Error('Invalid account RPC result')
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
