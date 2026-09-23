/** Host dispatcher protected by the Antigravity account RPC activation guard. */
import type { ConnectionRpcResult as RpcResult } from '@deepseek-ai/dsh-client-connection';
import type { BootstrapStatusService } from './status.ts';
import type { QuotaStatusView } from './quota.ts';
import type { AntigravityAccountView } from './auth-service.ts';
import type { AntigravityModelCatalogService } from './model-catalog.ts';
export { ANTIGRAVITY_AUTH_RPC_CHANNEL, ANTIGRAVITY_AUTH_RPC_NAMESPACE } from './rpc-contract.ts';
export type AntigravityRpcAuthService = Pick<BootstrapStatusService, 'status' | 'acknowledgeRisk' | 'startLogin' | 'cancelLogin' | 'logout' | 'revoke'> & {
    usage?: (signal?: AbortSignal, force?: boolean) => Promise<QuotaStatusView>;
    accounts?: () => Promise<readonly AntigravityAccountView[]>;
    selectAccount?: (id: string) => Promise<readonly AntigravityAccountView[]>;
    updateAccount?: (id: string, patch: {
        label?: string | undefined;
        tier?: string | undefined;
    }) => Promise<readonly AntigravityAccountView[]>;
    renameAccount?: (id: string, label: string) => Promise<readonly AntigravityAccountView[]>;
    removeAccount?: (id: string) => Promise<readonly AntigravityAccountView[]>;
};
/** Dispatch closed, value-safe requests; callback URLs are never echoed. */
export declare function handleAntigravityAuthRpc(service: AntigravityRpcAuthService, endpoint: string, payload: unknown, signal?: AbortSignal, modelCatalog?: AntigravityModelCatalogService): Promise<RpcResult<unknown>>;
