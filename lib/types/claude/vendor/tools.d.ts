/**
 * Presentation of harness tool schemas to the CLI as an MCP server, and
 * recovery of harness tool names from the wire names the model produces.
 *
 * The CLI has no flag for "here are the tools, hand their calls back to me".
 * It does have MCP, so this adapter declares the harness's tools through a
 * bridge server the CLI launches. The model then emits real `tool_use` blocks
 * with provider-validated arguments, which is the whole reason for the
 * indirection: no prompt-level tool-call convention could match it.
 *
 * The bridge never executes anything. The harness owns execution, and the
 * adapter ends the stream as soon as the model's message does, so the CLI is
 * gone before a call could be dispatched.
 *
 * @module dsh-claude-cli/tools
 */
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
/** MCP server name the bridge registers under; fixes the model-visible tool prefix. */
export declare const MCP_SERVER_NAME = "dsh";
/** Prefix the CLI prepends to every tool served by {@link MCP_SERVER_NAME}. */
export declare const TOOL_NAME_PREFIX = "mcp__dsh__";
/** One harness tool as the bridge serves it. */
export interface BridgeTool {
    /** Prefix-free name; the model sees it as `mcp__dsh__<name>`. */
    name: string;
    description: string;
    /** JSON Schema for the arguments, passed through unchanged. */
    inputSchema: Record<string, unknown>;
}
/** Tools as the bridge serves them, plus the map back to harness names. */
export interface ToolBridgeSpec {
    tools: BridgeTool[];
    /** Bridge name to harness name, for every tool whose name was rewritten. */
    harnessNames: Record<string, string>;
}
/**
 * Adapt harness tool schemas for the bridge.
 *
 * A harness tool name is normally already a legal provider tool name and
 * passes through untouched. One that is not is rewritten and recorded, so the
 * harness name can be restored from the model's call.
 *
 * @param schemas - the request's tool schemas.
 * @returns the bridge's tool list and the reverse name map.
 */
export declare function buildToolBridgeSpec(schemas: readonly ToolSchema[]): ToolBridgeSpec;
/**
 * Recover the harness tool name from a name the model called.
 * @param wireName - the `name` on a `tool_use` block.
 * @param harnessNames - the reverse map from {@link buildToolBridgeSpec}.
 * @returns the harness tool name, or undefined when the call did not address
 *   the bridge (the CLI's own tools are disabled, so this means a stray call).
 */
export declare function harnessToolName(wireName: string, harnessNames: Readonly<Record<string, string>>): string | undefined;
