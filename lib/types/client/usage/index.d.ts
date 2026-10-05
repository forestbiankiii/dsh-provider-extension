/** Register one additive global panel; no Session binding or extra application shell. */
import type { Context } from '@deepseek-ai/cordis';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        main: {
            kind: 'keyed';
            scope: 'root';
        };
        'sidebar.panellist': {
            kind: 'list';
            scope: 'root';
            owner: {
                size: number;
                active: boolean;
            };
        };
    }
}
export declare function applyUsagePage(ctx: Context, rpc: ClientConnectionRpc): void;
