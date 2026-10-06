/**
 * The model catalog and per-model metadata this adapter advertises.
 *
 * The CLI has no model-listing command, so the catalog is a static list of the
 * aliases and ids it accepts. It is advisory, as the harness requires: any
 * model string the caller supplies is passed through to `--model` unchanged,
 * whether or not it appears here.
 *
 * @module dsh-claude-cli/models
 */
import { type LlmModelInfo, type LlmReasoningEffortInfo } from '@deepseek-ai/dsh-llm';
/**
 * Reasoning efforts the CLI's `--effort` flag accepts, in increasing order.
 *
 * These are the CLI's own spellings, passed through unchanged. No `off` entry
 * exists because the flag has no value that disables reasoning.
 */
export declare const REASONING_EFFORTS: readonly LlmReasoningEffortInfo[];
/**
 * List the catalog for one provider route.
 * @param provider - the route the entries belong to.
 * @returns catalog entries bound to that route, in display order.
 */
export declare function listCatalog(provider: string): LlmModelInfo[];
/**
 * Look up the context capacity this adapter knows for one model id.
 * @param model - the exact model id from the request.
 * @returns the capacity in tokens, or undefined when the id is an alias or is
 *   not in the catalog — absence means unknown, not invalid.
 */
export declare function contextWindowOf(model: string): number | undefined;
/**
 * Find the catalog display name for one model id.
 * @param model - the exact model id from the request.
 * @returns the catalog name, or the id itself when it is not listed.
 */
export declare function displayNameOf(model: string): string;
