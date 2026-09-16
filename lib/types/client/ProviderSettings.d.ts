/** Settings page that creates and drives the plugin's provider integrations. */
import { type ReactNode } from 'react';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type CodexAccountsState } from './providers/codex.ts';
import { type AntigravityState } from './providers/antigravity.ts';
/** Per-surface actions and stores injected by the client plugin. */
export interface ProviderSettingsInjected {
    hooks: {
        /** Secret-free ChatGPT account roster from the Codex integration. */
        accounts: SnapshotStore<CodexAccountsState>;
        /** Antigravity companion status and advisory model catalog. */
        antigravity: SnapshotStore<AntigravityState>;
    };
    loadAccounts: () => Promise<void>;
    readQuota: (id: string) => Promise<void>;
    loadAntigravity: () => Promise<void>;
    loginAntigravity: () => Promise<void>;
    logoutAntigravity: () => Promise<void>;
}
/** Settings-section props: the shell lends `close`, the plugin injects the rest. */
export type ProviderSettingsProps = PropsRuntime<'settings.section'> & PropsLocale<'providerExtension'> & InjectFace<ProviderSettingsInjected>;
/** Render provider creation plus the status of every supported integration. */
export declare function ProviderSettings({ useAccounts, useAntigravity, loadAccounts, readQuota, loadAntigravity, loginAntigravity, logoutAntigravity, t, }: ProviderSettingsProps): ReactNode;
