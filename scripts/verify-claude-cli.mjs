/** Read only the official CLI's public status/help, not its credential files; never infer. */
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
const source = await readFile(new URL('../src/claude/service.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'node20' })
const { ClaudeChannelService, resolveClaudeLauncher } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const service = new ClaudeChannelService()
try {
  const state = await service.status()
  console.log(JSON.stringify(state)) // only masked/allowlisted fields
  const launcher = resolveClaudeLauncher()
  const execute = promisify(execFile)
  const opts = { timeout: 15000, maxBuffer: 262144, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  const version = await execute(launcher.executable, [...launcher.args, '--version'], opts)
  console.log(`Official CLI version: ${version.stdout.trim().slice(0, 128)}`)
  const help = await execute(launcher.executable, [...launcher.args, '--help'], opts)
  const flags = ['--print', '--input-format', '--output-format', '--include-partial-messages', '--no-session-persistence', '--setting-sources', '--strict-mcp-config', '--tools', '--permission-mode', '--model', '--effort']
  const missing = flags.filter(flag => !help.stdout.includes(flag))
  if (missing.length) throw new Error(`CLI is missing required flags: ${missing.join(', ')}`)
  // Older CLI versions hide this supported flag from --help; check acceptance using --version only.
  await execute(launcher.executable, [...launcher.args, '--system-prompt-file', fileURLToPath(new URL('../LICENSE', import.meta.url)), '--version'], opts)
  console.log('Required adapter flags found, including the hidden system-prompt-file option. No login or model request was performed.')
  if (state.status === 'failed' || state.status === 'missing') process.exitCode = 1
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Claude CLI verification failed')
  process.exitCode = 1
} finally { service.dispose() }
