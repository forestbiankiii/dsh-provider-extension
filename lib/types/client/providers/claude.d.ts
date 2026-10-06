/** CLI-owned Claude identity; no credential fields or persistent browser account cache. */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { ClaudeStatus } from '../../claude/service.ts';
export declare function claudeEnabledModels(): Set<string> | undefined;
export declare function saveClaudeEnabledModels(models: Set<string>): void;
export interface ClaudeClientState {
    status: ClaudeStatus['status'] | 'idle' | 'checking';
    label: string | null;
    plan: string | null;
    authMethod: string | null;
    errorCode: string | null;
    loginStarted: boolean;
}
export declare class ClaudeController {
    private readonly rpc;
    readonly store: import("../store.ts").WritableSnapshotStore<ClaudeClientState>;
    private readonly lifetime;
    private generation;
    constructor(rpc: ClientConnectionRpc);
    private call;
    load(): Promise<void>;
    login(): Promise<void>;
    models(): Promise<readonly {
        id: string;
        name: string;
    }[]>;
    dispose(): void;
}
