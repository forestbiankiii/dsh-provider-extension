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
/** Everything needed to launch one CLI process. */
export interface CliInvocation {
    /** Path or command name of the `claude` executable. */
    executable: string;
    args: readonly string[];
    /** The stream-json user turn written to stdin, which is then closed. */
    stdinPayload: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
}
/** Controls for one running CLI process. */
export interface CliRun {
    /** Stdout lines in order, ending when the process closes its stdout. */
    lines: AsyncIterableIterator<string>;
    /** Terminate the process and release its listeners; repeat calls are no-ops. */
    close: () => Promise<void>;
    /** Everything the process has written to stderr, for diagnostics. */
    stderr: () => string;
    /** Exit code, or null while the process is still running. */
    exitCode: () => number | null;
}
/**
 * Launch one CLI process and expose its stdout as lines.
 *
 * @param invocation - executable, arguments, stdin payload, and environment.
 * @param options - caller abort and the idle bound between stdout lines.
 * @returns handles for reading the process and tearing it down.
 * @throws LlmError `CLI_NOT_FOUND` when the executable cannot be spawned.
 */
export declare function runCli(invocation: CliInvocation, options: {
    signal?: AbortSignal;
    idleTimeoutMs: number;
}): CliRun;
