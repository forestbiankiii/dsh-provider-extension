export declare const CLAUDE_PROVIDER = "anthropic-claude-cli";
export interface ClaudeLauncher {
    executable: string;
    args: readonly string[];
}
export interface ClaudeStatus {
    status: 'ready' | 'signed-out' | 'missing' | 'failed';
    label: string | null;
    plan: string | null;
    authMethod: string | null;
    checkedAt: number;
    errorCode: 'cli-missing' | 'cli-failed' | 'invalid-response' | null;
}
export declare function resolveClaudeLauncher(command?: string, platform?: NodeJS.Platform, searchPath?: string, nodePath?: string): ClaudeLauncher;
export declare function projectClaudeStatus(value: unknown, checkedAt?: number): ClaudeStatus;
export declare class ClaudeChannelService {
    private readonly launcher;
    private readonly probe;
    private readonly lifetime;
    constructor(launcher?: () => ClaudeLauncher, probe?: (launcher: ClaudeLauncher, signal: AbortSignal) => Promise<string>);
    status(signal?: AbortSignal): Promise<ClaudeStatus>;
    /** User-only action: run the official binary's own login in a visible terminal. */
    login(): Promise<void>;
    dispose(): void;
}
