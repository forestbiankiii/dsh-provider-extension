/**
 * Process lifecycle for one `claude` invocation.
 *
 * Owns the parts a subprocess boundary makes non-obvious: newline framing
 * across chunk boundaries, an idle watchdog that arms only while the consumer
 * is actually waiting, abort propagation, and a terminate-then-kill teardown
 * that runs on every exit path including the early return the adapter takes
 * when a turn ends in a tool call.
 *
 * @module dsh-claude-cli/cli
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { ABORTED_CODE, CLI_NOT_FOUND_CODE, CLI_EXIT_CODE, TIMEOUT_CODE } from './failure.ts'

/** Grace period between `SIGTERM` and `SIGKILL`, in milliseconds. */
const KILL_GRACE_MS = 2000

/** Everything needed to launch one CLI process. */
export interface CliInvocation {
  /** Path or command name of the `claude` executable. */
  executable: string
  args: readonly string[]
  /** The stream-json user turn written to stdin, which is then closed. */
  stdinPayload: string
  cwd: string
  env: NodeJS.ProcessEnv
}

/** Controls for one running CLI process. */
export interface CliRun {
  /** Stdout lines in order, ending when the process closes its stdout. */
  lines: AsyncIterableIterator<string>
  /** Terminate the process and release its listeners; repeat calls are no-ops. */
  close: () => Promise<void>
  /** Everything the process has written to stderr, for diagnostics. */
  stderr: () => string
  /** Exit code, or null while the process is still running. */
  exitCode: () => number | null
}

/**
 * Launch one CLI process and expose its stdout as lines.
 *
 * @param invocation - executable, arguments, stdin payload, and environment.
 * @param options - caller abort and the idle bound between stdout lines.
 * @returns handles for reading the process and tearing it down.
 * @throws LlmError `CLI_NOT_FOUND` when the executable cannot be spawned.
 */
export function runCli(
  invocation: CliInvocation,
  options: { signal?: AbortSignal; idleTimeoutMs: number },
): CliRun {
  const child: ChildProcessWithoutNullStreams = spawn(
    invocation.executable,
    [...invocation.args],
    { cwd: invocation.cwd, env: invocation.env, stdio: ['pipe', 'pipe', 'pipe'] },
  )

  const queue: string[] = []
  let pending: (() => void) | undefined
  let stdoutRest = ''
  let stderrText = ''
  let finished = false
  let failure: Error | undefined
  let exit: number | null = null
  let killTimer: NodeJS.Timeout | undefined
  let idleTimer: NodeJS.Timeout | undefined
  let closePromise: Promise<void> | undefined
  let childClosed = false

  const wake = (): void => {
    const resume = pending
    pending = undefined
    resume?.()
  }

  const settle = (error?: Error): void => {
    if (finished) return
    finished = true
    failure ??= error
    wake()
  }

  const close = (): Promise<void> => {
    if (closePromise) return closePromise
    settle()
    clearTimeout(idleTimer)
    closePromise = new Promise<void>(resolve => {
      if (childClosed) resolve()
      else child.once('close', () => resolve())
    })
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
      killTimer.unref()
    }
    child.stdout.destroy()
    child.stderr.destroy()
    options.signal?.removeEventListener('abort', onAbort)
    return closePromise
  }

  function onAbort(): void {
    settle(new LlmError('The request was aborted by the caller.', ABORTED_CODE))
    close()
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    if (chunk.length + stdoutRest.length + queue.reduce((size, line) => size + line.length, 0) > 16 * 1024 * 1024) {
      settle(new LlmError('Claude CLI output exceeded the buffered frame limit.', CLI_EXIT_CODE))
      close()
      return
    }
    const text = stdoutRest + chunk
    const parts = text.split('\n')
    stdoutRest = parts.pop() ?? ''
    for (const part of parts) {
      if (part.length > 0) queue.push(part)
    }
    wake()
  })
  child.stdout.on('end', () => {
    if (stdoutRest.length > 0) {
      queue.push(stdoutRest)
      stdoutRest = ''
    }
    settle()
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderrText = (stderrText + chunk).slice(-32768)
  })

  child.on('error', (error: NodeJS.ErrnoException) => {
    settle(
      error.code === 'ENOENT'
        ? new LlmError(
          `The \`${invocation.executable}\` executable was not found.`
          + ' Install Claude Code and make it available on PATH, or set `executable`.',
          CLI_NOT_FOUND_CODE,
          { cause: error },
        )
        : error,
    )
  })
  child.on('exit', (code) => {
    exit = code
  })
  child.once('close', () => { childClosed = true; clearTimeout(killTimer); settle() })

  if (options.signal?.aborted === true) onAbort()
  else options.signal?.addEventListener('abort', onAbort, { once: true })

  // A process that exits before reading its input makes the write fail; the
  // exit itself is the meaningful event and is already observed above.
  child.stdin.on('error', () => {})
  child.stdin.end(invocation.stdinPayload)

  const lines: AsyncIterableIterator<string> = {
    [Symbol.asyncIterator]() {
      return this
    },
    async next(): Promise<IteratorResult<string>> {
      for (;;) {
        const line = queue.shift()
        if (line !== undefined) return { value: line, done: false }
        if (finished) {
          if (failure !== undefined) {
            const error = failure
            failure = undefined
            throw error
          }
          return { value: undefined, done: true }
        }
        await new Promise<void>((resolve) => {
          pending = resolve
          idleTimer = setTimeout(() => {
            settle(new LlmError(
              `The \`claude\` process produced no output for ${options.idleTimeoutMs}ms.`,
              TIMEOUT_CODE,
            ))
          }, options.idleTimeoutMs)
          idleTimer.unref()
        })
        clearTimeout(idleTimer)
      }
    },
    async return(): Promise<IteratorResult<string>> {
      await close()
      return { value: undefined, done: true }
    },
  }

  return { lines, close, stderr: () => stderrText, exitCode: () => exit }
}
