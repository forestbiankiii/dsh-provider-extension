/** Settings page: Level 1 hub with expandable quick views, and Level 2 provider-only detail view. */
import { type ReactNode } from 'react';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type CodexAccountsState } from './providers/codex.ts';
import { type AntigravityState } from './providers/antigravity.ts';
import { type OpencodeState } from './providers/opencode.ts';
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
    loginCodex: () => Promise<void>;
    selectCodexAccount?: (id: string) => Promise<void>;
    renameCodexAccount?: (id: string, label: string) => Promise<void>;
    removeCodexAccount: (id: string) => Promise<void>;
    resetCodexQuota?: (id: string) => Promise<void>;
    loadAntigravity: () => Promise<void>;
    loginAntigravity: () => Promise<void>;
    logoutAntigravity: () => Promise<void>;
    selectAntigravityAccount?: (id: string) => Promise<void>;
    updateAntigravityAccount?: (id: string, patch: {
        label?: string;
        tier?: string;
    }) => Promise<void>;
    renameAntigravityAccount?: (id: string, label: string) => Promise<void>;
    removeAntigravityAccount?: (id: string) => Promise<void>;
    readAntigravityQuota?: (id?: string) => Promise<void>;
    useOpencode?: <T>(selector: (state: OpencodeState) => T) => T;
    saveOpencodeConfig?: (apiKey: string, baseURL?: string) => void;
    readOpencodeUsage?: () => Promise<void>;
    refreshOpencodeModels?: () => Promise<void>;
}
/** Settings-section props: the shell lends `close`, the plugin injects the rest. */
export type ProviderSettingsProps = PropsRuntime<'settings.section'> & PropsLocale<'providerExtension'> & InjectFace<ProviderSettingsInjected>;
export declare const CODEX_MODELS: readonly [{
    readonly id: "gpt-6-astra";
    readonly name: "GPT-6 Astra";
}, {
    readonly id: "gpt-6-sol";
    readonly name: "GPT-6 Sol";
}, {
    readonly id: "gpt-6-luna";
    readonly name: "GPT-6 Luna";
}, {
    readonly id: "gpt-reserve";
    readonly name: "GPT Reserve";
}, {
    readonly id: "gpt-5.6-sol";
    readonly name: "GPT-5.6 Sol";
}, {
    readonly id: "gpt-5.6-terra";
    readonly name: "GPT-5.6 Terra";
}, {
    readonly id: "gpt-5.6-luna";
    readonly name: "GPT-5.6 Luna";
}, {
    readonly id: "gpt-5.5";
    readonly name: "GPT-5.5";
}, {
    readonly id: "codex-auto-review";
    readonly name: "Codex Auto Review";
}];
export declare const GEMINI_TIERS: readonly ["Free", "Pro", "Ultra"];
export type GeminiTier = typeof GEMINI_TIERS[number];
/** Render two-level provider hub: Level 1 overview with quick views, and Level 2 single-provider detail. */
export declare function ProviderSettings({ useAccounts, useAntigravity, loadAccounts, readQuota, loginCodex, selectCodexAccount, renameCodexAccount, removeCodexAccount, resetCodexQuota, loadAntigravity, loginAntigravity, logoutAntigravity, selectAntigravityAccount, updateAntigravityAccount, renameAntigravityAccount, removeAntigravityAccount, readAntigravityQuota, useOpencode, saveOpencodeConfig, readOpencodeUsage, refreshOpencodeModels, t, }: ProviderSettingsProps): ReactNode;
