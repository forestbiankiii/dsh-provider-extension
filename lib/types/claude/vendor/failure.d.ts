/**
 * Classification of Claude Code CLI failures into provider-neutral
 * {@link LlmFailure} facts.
 *
 * The CLI reports failures three ways: a non-zero exit with no `result` line,
 * an `assistant` line flagged `is_api_error_message` carrying an `error` code,
 * and a terminal `result` line with `is_error`. All three land here so that
 * consumers route on `code` and never on provider text.
 *
 * @module dsh-claude-cli/failure
 */
import { type LlmFailure } from '@deepseek-ai/dsh-llm';
/** The `claude` executable was not found or could not be spawned. */
export declare const CLI_NOT_FOUND_CODE = "CLI_NOT_FOUND";
/** The CLI exited before emitting a usable model response. */
export declare const CLI_EXIT_CODE = "CLI_EXIT";
/** The CLI is installed but has no usable Claude login. */
export declare const MISSING_CREDENTIAL_CODE = "MISSING_CREDENTIAL";
/** The account's usage window is exhausted; `providerRetryAfterMs` carries the reset delay. */
export declare const RATE_LIMIT_CODE = "RATE_LIMIT";
/** A CLI failure this adapter could not classify further. */
export declare const PROVIDER_ERROR_CODE = "PROVIDER_ERROR";
/** A `GenerateOptions` field the CLI has no way to honor. */
export declare const UNSUPPORTED_CODE = "UNSUPPORTED";
/** No output was produced within the configured idle window. */
export declare const TIMEOUT_CODE = "TIMEOUT";
/** The caller aborted the request. */
export declare const ABORTED_CODE = "ABORTED";
/**
 * Map a CLI error code and message onto a provider-neutral failure code.
 *
 * Ordering matters: credential and quota failures are checked before the
 * generic context-overflow text match, because their messages never describe a
 * context bound and an earlier match would mask the more actionable code.
 *
 * @param cliError - the CLI's own error identifier, when it supplied one.
 * @param message - the human-readable failure text.
 * @returns the stable code consumers route on.
 */
export declare function classifyCliError(cliError: string | undefined, message: string): string;
/**
 * Convert a rate-limit reset instant into a delay this adapter may report.
 * @param resetsAtUnixSeconds - the CLI-reported reset instant, in Unix seconds.
 * @param nowMs - current wall-clock time in milliseconds.
 * @returns a positive bounded delay, or undefined when the instant is absent,
 *   already past, or implausibly far away.
 */
export declare function retryAfterMs(resetsAtUnixSeconds: number | undefined, nowMs: number): number | undefined;
/**
 * Build a failure record from classified CLI facts.
 * @param message - human-readable failure text.
 * @param code - the stable code from {@link classifyCliError} or a constant here.
 * @param extra - optional HTTP status, retry delay, and CLI session id.
 * @returns the provider-neutral failure.
 */
export declare function cliFailure(message: string, code: string, extra?: {
    status?: number;
    providerRetryAfterMs?: number;
}): LlmFailure;
