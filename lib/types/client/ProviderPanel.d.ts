/** Provider and model/reasoning controls that replace the shipped model seat. */
import { type ReactNode } from 'react';
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type CodexAccountsState } from './providers/codex.ts';
import { type AntigravityState } from './providers/antigravity.ts';
import { type OpencodeState } from './providers/opencode.ts';
/** Per-session injected seat dependencies. */
export interface ProviderPanelInjected {
    /** Addressed subagent sessions cannot use Agent-bound model selection. */
    available: boolean;
    hooks: {
        /** Session model directory bound by the renderer as useDirectory. */
        directory: SnapshotStore<ModelDirectoryState>;
        /** Secret-free Codex account roster from the installed subscription plugin. */
        accounts: SnapshotStore<CodexAccountsState>;
        /** Antigravity controller store with accounts and quota. */
        antigravity?: SnapshotStore<AntigravityState>;
    };
    /** Load the session's shared model directory. */
    loadDirectory: () => Promise<void>;
    /** Load the optional Codex subscription account roster. */
    loadAccounts: () => Promise<void>;
    /** Select the real active Codex account used for subsequent quota and requests. */
    selectAccount: (id: string) => Promise<void>;
    /** Read one account's quota, reverting the temporary switch when it is not active. */
    readQuota: (id: string) => Promise<void>;
    /** Submit one complete selection through the shared directory. */
    select: (selection: ModelSelection) => Promise<void>;
    /** Load Antigravity state & accounts. */
    loadAntigravity?: () => Promise<void>;
    /** Select active Antigravity account. */
    selectAntigravityAccount?: (id: string) => Promise<void>;
    /** Read Antigravity quota for specific or active account. */
    readAntigravityQuota?: (id?: string) => Promise<void>;
    /** OpenCode reactive snapshot. */
    useOpencode?: <T>(selector: (state: OpencodeState) => T) => T;
    /** Read OpenCode usage. */
    readOpencodeUsage?: () => Promise<void>;
}
/** Complete replacement-seat props, including the composer's lock state. */
export type ProviderPanelProps = PropsRuntime<'conversation.input.model'> & PropsLocale<'providerExtension'> & InjectFace<ProviderPanelInjected>;
/** Convert one horizontal pointer coordinate into a discrete effort index. */
export declare function sliderIndexFromPoint(clientX: number, rect: {
    left: number;
    width: number;
}, count: number): number;
/** Render separate provider and model controls inside the official model seat. */
export declare function ProviderPanel({ locked, available, useDirectory, useAccounts, useAntigravity, loadDirectory, loadAccounts, selectAccount, readQuota, select, loadAntigravity, selectAntigravityAccount, readAntigravityQuota, useOpencode, readOpencodeUsage, t, }: ProviderPanelProps): ReactNode;
