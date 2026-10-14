import type { Context } from '@deepseek-ai/cordis';
import { type EnumConfig } from './enum-preference.ts';
export type ConnectionMode = 'sse' | 'websocket';
export type ConnectionModeConfig = EnumConfig<ConnectionMode>;
export declare const connectionModeSchema: import("@deepseek-ai/schemastery").default<"sse" | "websocket", "sse" | "websocket">;
export declare const createConnectionModeOwner: (ctx: Context, config?: ConnectionModeConfig) => {
    current: () => ConnectionMode;
    writable: boolean;
    save(value: ConnectionMode, signal?: AbortSignal): Promise<void>;
};
export interface SocketControls {
    closeOpenAICodexWebSocketSessions(id: string): void;
    resetOpenAICodexWebSocketDebugStats(id: string): void;
}
export declare function createCodexConnection({ mode, cloudMode, resolveProxy, accountForToken, WebSocket, loadControls }: {
    mode: () => ConnectionMode;
    cloudMode: () => string;
    resolveProxy: () => Promise<string | undefined>;
    accountForToken: (token: string | undefined) => string | undefined;
    WebSocket: any;
    loadControls: () => Promise<SocketControls>;
}): {
    wrapAdapter<T extends object>(adapter: T): T;
    prepare(options?: any): Promise<any>;
    close(rawId?: string): Promise<void>;
    retireIdle(): void;
    dispose(): Promise<void>;
};
