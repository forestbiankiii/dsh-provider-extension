/** Provider-owned balances/quotas are account-wide, independent of usage-log filters. */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { UsageProviderBalance } from '../../usage/types.ts';
import type { UsageKey } from './locales.ts';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
export declare function ProviderBalances({ providers, t, locale, rpc, onReset }: {
    providers: UsageProviderBalance[];
    t: Translate<UsageKey>;
    locale: string;
    rpc?: ClientConnectionRpc;
    onReset?: () => void;
}): import("react").JSX.Element;
