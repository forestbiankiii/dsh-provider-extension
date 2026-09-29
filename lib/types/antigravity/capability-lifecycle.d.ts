/** Shared race-safe registration lifecycle for one independently gated capability row. */
import type { Context } from '@deepseek-ai/cordis';
import type { AntigravityStatusView, CapabilityRowId } from './status.ts';
export interface CapabilityStatusSource {
    status(): Promise<AntigravityStatusView>;
    watchStatus?(listener: () => void): () => void;
    dispose?(): Promise<void>;
}
export interface CapabilityLifecycleOptions {
    readonly ctx: Context;
    readonly auth: CapabilityStatusSource;
    readonly id: CapabilityRowId;
    readonly enabled: () => boolean;
    /**
     * Register one capability row. Return a disposer, `undefined` when the host
     * service is not ready yet, or the `'retry'` sentinel when registration must
     * be attempted again shortly (for example while a previous plugin
     * generation's adapter is still winding down after a live reload).
     */
    readonly register: () => (() => void) | 'retry' | undefined;
    readonly ownsAuth?: boolean;
    readonly cleanup?: () => void | Promise<void>;
    readonly label: string;
}
export interface CapabilityLifecycle {
    sync(): void;
    refresh(): Promise<void>;
}
/** Register a capability set atomically and dispose every owned member best-effort. */
export declare function registerCapabilitySet<T>(values: readonly T[], register: (value: T) => () => void): () => void;
export declare function mountCapabilityLifecycle(options: CapabilityLifecycleOptions): CapabilityLifecycle;
