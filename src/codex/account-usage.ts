/** A targeted, read-only quota request. Failure must not fall back to another account. */
export interface CodexAccountUsageOptions {
  getAuth(id: string, signal: AbortSignal): Promise<unknown>
  readCredential(id: string): Promise<unknown>
  resolveAccountId(credential: Record<string, unknown>): unknown
  fetch(url: string, init: RequestInit): Promise<Response>
  parse(value: unknown): unknown
  url: string
  userAgent: string
  timeoutMs: number
}
export async function readCodexAccountUsage(id: string, options: CodexAccountUsageOptions, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted()
  if (!id || id.length > 512) throw new Error('ChatGPT subscription is not signed in')
  const resolved = await options.getAuth(id, signal)
  const auth = resolved !== null && typeof resolved === 'object' ? (resolved as { auth?: { apiKey?: unknown } }).auth : undefined
  if (typeof auth?.apiKey !== 'string' || !auth.apiKey) throw new Error('ChatGPT sign-in needs to be renewed')
  signal.throwIfAborted()
  const raw = await options.readCredential(id)
  const credential = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined
  if (!credential || typeof credential.access !== 'string' || !credential.access) throw new Error('ChatGPT subscription is not signed in')
  if (credential.access !== auth.apiKey) throw new Error('ChatGPT credential changed during quota read')
  const accountId = options.resolveAccountId(credential)
  if (typeof accountId !== 'string' || !accountId) throw new Error('ChatGPT subscription is not signed in')
  const response = await options.fetch(options.url, {
    method: 'GET', redirect: 'error',
    headers: { authorization: `Bearer ${auth.apiKey}`, 'chatgpt-account-id': accountId, accept: 'application/json', 'cache-control': 'no-store', 'user-agent': options.userAgent },
    signal: AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs)]),
  })
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'ChatGPT sign-in needs to be renewed' : 'Could not read ChatGPT usage')
  return options.parse(await response.json())
}
