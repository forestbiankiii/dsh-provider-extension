/** Optional, secret-free integration with dsh-codex-subscription 2.x account RPC. */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
export interface CodexAccountView {
    readonly id: string;
    readonly label: string;
    readonly active: boolean;
    readonly email?: string;
}
export interface CodexAccountsState {
    readonly status: 'idle' | 'loading' | 'ready' | 'error';
    readonly accounts: readonly CodexAccountView[];
    readonly error: string | null;
    readonly switchingId?: string;
}
interface WritableSnapshotStore<T> extends SnapshotStore<T> {
    set(next: T): void;
}
/** Whether a model-directory route belongs to the Codex subscription provider. */
export declare function isCodexProvider(provider: string | undefined): boolean;
/** Hide account email local parts in the composer while keeping rows distinguishable. */
export declare function maskedEmail(email: string | undefined): string | undefined;
/** Root-scoped account roster and true active-account switcher. */
export declare class CodexAccountsController {
    private readonly rpc;
    readonly store: WritableSnapshotStore<CodexAccountsState>;
    private generation;
    private disposed;
    constructor(rpc: ClientConnectionRpc);
    load(): Promise<void>;
    select(id: string): Promise<void>;
    invalidate(): void;
    dispose(): void;
}
export {};
