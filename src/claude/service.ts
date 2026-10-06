/** Official CLI metadata only. Never read, import, export or rewrite Claude credentials. */
import { existsSync } from 'node:fs'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

export const CLAUDE_PROVIDER = 'anthropic-claude-cli'
export interface ClaudeLauncher { executable: string; args: readonly string[] }
export interface ClaudeStatus {
  status: 'ready' | 'signed-out' | 'missing' | 'failed'
  label: string | null
  plan: string | null
  authMethod: string | null
  checkedAt: number
  errorCode: 'cli-missing' | 'cli-failed' | 'invalid-response' | null
}
const runFile = promisify(execFile)
export function resolveClaudeLauncher(command = 'claude', platform = process.platform, searchPath = process.env.PATH ?? '', nodePath = process.execPath): ClaudeLauncher {
  const directories = searchPath.split(delimiter).map(directory => directory.replace(/^"|"$/g, '')).filter(Boolean)
  const fileName = platform === 'win32' && !/\.(?:exe|cmd|bat|ps1)$/i.test(command) ? `${command}.exe` : command
  const candidates = isAbsolute(command) || /[\\/]/.test(command) ? [resolve(command)] : directories.map(directory => join(directory, fileName))
  for (const file of candidates) if (existsSync(file) && !/\.(?:cmd|bat|ps1)$/i.test(file)) return { executable: file, args: [] }
  // npm's Windows shims are not executable without a shell. Resolve the public JS entry instead.
  if (platform === 'win32' && command === 'claude') for (const directory of directories) {
    const packageRoot = join(directory, 'node_modules', '@anthropic-ai', 'claude-code')
    const native = join(packageRoot, 'bin', 'claude.exe')
    if (existsSync(native)) return { executable: native, args: [] }
    const entry = join(packageRoot, 'cli.js')
    if (existsSync(entry)) return { executable: nodePath, args: [entry] }
  }
  throw new Error('cli-missing')
}
export function projectClaudeStatus(value: unknown, checkedAt = Date.now()): ClaudeStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-response')
  const record = value as Record<string, unknown>
  if (typeof record.loggedIn !== 'boolean') throw new Error('invalid-response')
  const label = typeof record.email === 'string' ? record.email.slice(0, 128).replace(/([^\s@]{1,2})[^\s@]*@([^\s@]+)/g, '$1***@$2') : null
  const plan = typeof record.subscriptionType === 'string' && ['pro', 'max', 'team', 'enterprise', 'free'].includes(record.subscriptionType.toLowerCase()) ? record.subscriptionType.toUpperCase() : null
  const authMethod = typeof record.authMethod === 'string' && ['none', 'claude.ai', 'oauth_token', 'api_key', 'api_key_helper', 'third_party'].includes(record.authMethod) ? record.authMethod : null
  return { status: record.loggedIn ? 'ready' : 'signed-out', label: record.loggedIn ? label : null, plan: record.loggedIn ? plan : null, authMethod, checkedAt, errorCode: null }
}
export class ClaudeChannelService {
  private readonly lifetime = new AbortController()
  constructor(private readonly launcher: () => ClaudeLauncher = () => resolveClaudeLauncher(), private readonly probe: (launcher: ClaudeLauncher, signal: AbortSignal) => Promise<string> = async (launcher, signal) => {
    try {
      const result = await runFile(launcher.executable, [...launcher.args, 'auth', 'status'], { timeout: 10000, maxBuffer: 16384, windowsHide: true, signal, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
      return result.stdout
    } catch (error) {
      // `auth status` documents exit 1 when not logged in; accept its bounded JSON, not stderr.
      const failed = error as { code?: unknown; stdout?: unknown }
      if (failed.code === 1 && typeof failed.stdout === 'string' && failed.stdout.trim().startsWith('{')) return failed.stdout
      throw new Error('cli-failed')
    }
  }) {}
  async status(signal?: AbortSignal): Promise<ClaudeStatus> {
    const combined = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal
    combined.throwIfAborted()
    try {
      const launcher = this.launcher()
      const output = await this.probe(launcher, combined)
      combined.throwIfAborted()
      return projectClaudeStatus(JSON.parse(output))
    } catch (error) {
      combined.throwIfAborted()
      const code = error instanceof Error && ['cli-missing', 'cli-failed', 'invalid-response'].includes(error.message) ? error.message as 'cli-missing' | 'cli-failed' | 'invalid-response' : 'invalid-response'
      return { status: code === 'cli-missing' ? 'missing' : 'failed', label: null, plan: null, authMethod: null, checkedAt: Date.now(), errorCode: code }
    }
  }
  /** User-only action: run the official binary's own login in a visible terminal. */
  async login(): Promise<void> {
    this.lifetime.signal.throwIfAborted()
    if (process.platform !== 'win32') throw new Error('Run claude auth login in your terminal, then refresh.')
    const launcher = this.launcher()
    const quote = (text: string) => `'${text.replaceAll("'", "''")}'`
    const command = `& ${[launcher.executable, ...launcher.args, 'auth', 'login'].map(quote).join(' ')}`
    await new Promise<void>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NoExit', '-Command', command], { detached: true, stdio: 'ignore', windowsHide: false, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
      child.once('error', () => reject(new Error('Run claude auth login in your terminal, then refresh.')))
      child.once('spawn', () => { child.unref(); resolve() })
    })
  }
  dispose(): void { this.lifetime.abort() }
}
