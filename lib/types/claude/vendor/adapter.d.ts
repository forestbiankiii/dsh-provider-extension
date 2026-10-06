/**
 * The `LlmAdapter` implementation backed by the Claude Code CLI.
 *
 * Each request runs one `claude --print` process with the CLI's own agent
 * behavior switched off: its built-in tools are disabled, its settings sources
 * are not loaded, and its session is not persisted. What remains is the model
 * call itself, driven by the harness's system prompt, history, and tools.
 *
 * Authentication is the CLI's, not the harness's. There is no API key to
 * configure — whatever `claude` is already logged in as is what runs.
 *
 * @module dsh-claude-cli/adapter
 */
import { LlmAdapter, type GenerateOptions, type LlmProviderInfo, type LlmModelInfo, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm';
/** Resolved adapter configuration. */
export interface AdapterOptions {
    /** Path or command name of the `claude` executable. */
    executable: string;
    /** Working directory for the CLI process. */
    cwd: string;
    /** Maximum time between stdout lines before the request fails as `TIMEOUT`. */
    streamIdleTimeoutMs: number;
    /**
     * What to do with a request field the CLI cannot honor. `error` reports it
     * as `UNSUPPORTED` per the adapter contract; `ignore` drops it, which makes
     * the provider usable from an agent preset that sets such a field for every
     * route it might run on.
     */
    unsupportedFields: 'error' | 'ignore';
    /** Reasoning effort materialized into requests that omit one. */
    defaultEffort?: string;
    /**
     * Extra arguments for CLI flags not modeled here. Placed *before* the
     * adapter's own flags so they cannot override them, and rejected outright
     * when they name a flag in {@link RESERVED_FLAGS}.
     */
    extraArgs: readonly string[];
    /** Resolved launcher for npm installations on Windows; never use a command shell. */
    resolveExecutable?: () => {
        executable: string;
        args: readonly string[];
    };
    /** Host plugin lifetime; cancels processes on unload. */
    signal?: AbortSignal;
}
/**
 * Reject `extraArgs` entries that would undo the adapter's own invocation.
 *
 * Matches the flag name alone, so both `--tools default` and `--tools=default`
 * are caught.
 *
 * @param extraArgs - the configured extra arguments.
 * @throws LlmError `UNSUPPORTED` naming every reserved flag that was passed.
 */
export declare function assertExtraArgsSafe(extraArgs: readonly string[]): void;
/** Streams harness model calls through the locally installed Claude Code CLI. */
export declare class ClaudeCliAdapter extends LlmAdapter {
    #private;
    constructor(options: AdapterOptions);
    /**
     * Describe one route this adapter serves.
     * @param provider - a route registered for this instance.
     * @returns display metadata for selectors and diagnostics.
     */
    providerInfo(provider: string): LlmProviderInfo;
    /**
     * List the models the CLI is known to accept by name.
     * @param provider - a route registered for this instance.
     * @returns the advisory catalog; unlisted ids remain callable.
     */
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /**
     * Resolve metadata for one exact model.
     * @param provider - a route registered for this instance.
     * @param model - the exact model id the request will send to `--model`.
     * @returns identity plus context capacity and reasoning efforts when known.
     */
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    /**
     * Stream one model call through the CLI.
     * @param options - the assembled request; `signal` aborts the process.
     * @returns the harness chunk stream for one model message.
     */
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
