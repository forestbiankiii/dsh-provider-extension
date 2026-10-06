/**
 * Rendering of the harness conversation into the single user turn the Claude
 * Code CLI accepts.
 *
 * The CLI owns a conversation of its own, but the harness is the source of
 * truth for history: it compacts, edits, and replays messages the CLI never
 * sees. Each request therefore renders the harness history into one turn and
 * runs a fresh CLI process, so the model's view always equals the harness log.
 * The cost is that no prompt-cache prefix survives between turns; the benefit
 * is that no divergence between two transcripts is possible.
 *
 * Tool calls and results are rendered as text because they belong to turns the
 * CLI process did not take part in. Only the tool call the model makes *now*
 * is native, arriving through the tool bridge as a real `tool_use` block.
 *
 * @module dsh-claude-cli/render
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
/** Text substituted for an image block, which the CLI has no way to accept. */
export declare const IMAGE_PLACEHOLDER = "[image omitted: the anthropic-claude-cli provider cannot send images]";
/**
 * Render harness history into the text of one CLI user turn.
 *
 * A conversation whose only message is plain user text renders as that text
 * alone, so the common single-turn case reaches the model unframed.
 *
 * @param messages - the request's ordered messages, after the system slot.
 * @returns the user-turn text; empty only when every message rendered empty.
 */
export declare function renderConversation(messages: readonly {
    role: string;
    content: readonly ContentBlock[];
    toolCallId?: string;
    isError?: boolean;
}[]): string;
