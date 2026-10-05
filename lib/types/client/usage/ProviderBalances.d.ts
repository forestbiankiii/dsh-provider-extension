/** Provider-owned balances/quotas are account-wide, independent of usage-log filters. */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { UsageProviderBalance } from '../../usage/types.ts';
import type { UsageKey } from './locales.ts';
export declare function ProviderBalances({ providers, t, locale }: {
    providers: UsageProviderBalance[];
    t: Translate<UsageKey>;
    locale: string;
}): import("react").JSX.Element;
