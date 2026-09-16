/** Minimal local snapshot store shared by the provider integration modules. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
export interface WritableSnapshotStore<T> extends SnapshotStore<T> {
    set(next: T): void;
}
/** Create a tiny synchronous snapshot store owned by one plugin controller. */
export declare function createLocalStore<T>(initial: T): WritableSnapshotStore<T>;
export declare function failureMessage(error: unknown): string;
/** Narrow unknown JSON into a plain record. */
export declare function record(value: unknown): Record<string, unknown> | undefined;
