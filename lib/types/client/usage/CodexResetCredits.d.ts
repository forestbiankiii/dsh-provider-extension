import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { UsageKey } from './locales.ts';
export interface CodexResetCreditsProps {
    rpc: ClientConnectionRpc;
    accountId: string;
    label: string;
    availableCount: number;
    t: Translate<UsageKey>;
    locale: string;
    onReset?: (() => void | Promise<void>) | undefined;
}
export declare function CodexResetCredits({ rpc, accountId, label, availableCount, t, locale, onReset }: CodexResetCreditsProps): import("react").JSX.Element;
