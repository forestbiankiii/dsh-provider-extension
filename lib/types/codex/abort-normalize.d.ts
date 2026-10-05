/** Codex transport-abort normalization for the pi-ai event stream. */
/** The only pi-ai error fields this normalization reads. */
export interface PiAiErrorEvent {
    type?: string;
    error?: {
        stopReason?: string;
        errorMessage?: string;
    };
}
/**
 * Re-label transport-level aborts that pi-ai can only report as a bare
 * `aborted` failure. DSH classifies that text as `PI_AI_ERROR`, a catch-all its
 * retry policy never retries, so one dropped Codex connection ended the whole
 * turn. A connection-shaped message classifies as `TRANSPORT` and is retried
 * exactly like the TLS/socket disconnects already are. Caller cancellation and
 * messages that already classify as transport stay untouched.
 */
export declare function normalizeAbortDrops<T extends PiAiErrorEvent>(events: AsyncIterable<T>, options?: {
    signal?: AbortSignal;
}): AsyncGenerator<T>;
