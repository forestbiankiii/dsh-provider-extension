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

import { ReasoningEffortId, type LlmModelInfo, type LlmReasoningEffortInfo } from '@deepseek-ai/dsh-llm'

/** One catalog entry, before it is bound to a provider route. */
interface CatalogEntry {
  id: string
  name: string
  description: string
  /** Combined request and response capacity, when it is known for this id. */
  contextWindow?: number
}

/**
 * Models the CLI accepts by name. Aliases resolve to the current release of a
 * tier, which is why they carry no context capacity: the id does not name a
 * fixed model, so no fixed number is true of it.
 */
const CATALOG: readonly CatalogEntry[] = [
  { id: 'sonnet', name: 'Claude Sonnet', description: 'Official CLI alias. Availability is determined by your Claude account; not a discovered entitlement.' },
  { id: 'opus', name: 'Claude Opus', description: 'Official CLI alias. Availability is determined by your Claude account; not a discovered entitlement.' },
  { id: 'haiku', name: 'Claude Haiku', description: 'Official CLI alias. Availability is determined by your Claude account; not a discovered entitlement.' },
]

/**
 * Reasoning efforts the CLI's `--effort` flag accepts, in increasing order.
 *
 * These are the CLI's own spellings, passed through unchanged. No `off` entry
 * exists because the flag has no value that disables reasoning.
 */
export const REASONING_EFFORTS: readonly LlmReasoningEffortInfo[] = [
  { id: ReasoningEffortId('low'), name: 'Low' },
  { id: ReasoningEffortId('medium'), name: 'Medium' },
  { id: ReasoningEffortId('high'), name: 'High' },
  { id: ReasoningEffortId('xhigh'), name: 'Extra high' },
  { id: ReasoningEffortId('max'), name: 'Maximum' },
]

/**
 * List the catalog for one provider route.
 * @param provider - the route the entries belong to.
 * @returns catalog entries bound to that route, in display order.
 */
export function listCatalog(provider: string): LlmModelInfo[] {
  return CATALOG.map((entry) => ({
    provider,
    id: entry.id,
    name: entry.name,
    description: entry.description,
    inputModalities: ['text'] as const,
  }))
}

/**
 * Look up the context capacity this adapter knows for one model id.
 * @param model - the exact model id from the request.
 * @returns the capacity in tokens, or undefined when the id is an alias or is
 *   not in the catalog — absence means unknown, not invalid.
 */
export function contextWindowOf(model: string): number | undefined {
  return CATALOG.find((entry) => entry.id === model)?.contextWindow
}

/**
 * Find the catalog display name for one model id.
 * @param model - the exact model id from the request.
 * @returns the catalog name, or the id itself when it is not listed.
 */
export function displayNameOf(model: string): string {
  return CATALOG.find((entry) => entry.id === model)?.name ?? model
}
