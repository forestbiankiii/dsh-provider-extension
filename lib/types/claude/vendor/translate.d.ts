/**
 * Translation of CLI output lines into the harness {@link StreamChunk}
 * protocol.
 *
 * One harness request is exactly one model message. The CLI would happily keep
 * going after a tool call — it has its own agent loop — so this translator
 * ends the stream at the end of the first model message and lets the adapter
 * tear the process down. Everything the CLI emits afterwards belongs to a turn
 * the harness never asked for.
 *
 * @module dsh-claude-cli/translate
 */
import { type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm';
import { type WireUsage } from './protocol.ts';
/** Context one translation needs beyond the lines themselves. */
export interface TranslateContext {
    /** Bridge-to-harness tool names from `buildToolBridgeSpec`. */
    harnessNames: Readonly<Record<string, string>>;
    /** Wall-clock source, so a rate-limit reset instant becomes a delay. */
    now: () => number;
}
/**
 * Convert wire usage into harness token accounting.
 *
 * The provider already reports uncached input separately from cache reads and
 * writes, so the counts are disjoint as the harness requires and need no
 * subtraction.
 *
 * @param usage - the wire usage object, when the CLI supplied one.
 * @returns harness usage, or undefined when no counts were reported.
 */
export declare function toTokenUsage(usage: WireUsage | undefined): TokenUsage | undefined;
/**
 * Translate one CLI run's stdout lines into harness chunks.
 *
 * Terminates after the first `finish`, which is also the point at which the
 * caller stops the process.
 *
 * @param lines - stdout lines in order.
 * @param context - tool-name recovery and a clock.
 * @returns the chunk stream for one model call.
 */
export declare function translate(lines: AsyncIterable<string>, context: TranslateContext): AsyncGenerator<StreamChunk>;
