import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { DefaultModelView } from '../default-model.ts';
/** Only successful, bounded Host acknowledgements update the Settings display. */
export declare function defaultModelRequest(rpc: ClientConnectionRpc, request: {
    action: 'get';
} | {
    action: 'set';
    accountId: string;
    model: string;
}): Promise<DefaultModelView>;
