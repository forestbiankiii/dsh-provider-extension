/** Display-only card preferences. Stores IDs/visibility, never balances, labels or credentials. */
import { type ReactNode } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { UsageKey } from './locales.ts';
export declare const CARD_LAYOUT_KEY = "dsh-provider-extension:usage-card-layout";
type Layout = {
    version: 1;
    order: string[];
    hidden: string[];
};
export interface AccountCard {
    id: string;
    label: string;
    content: ReactNode;
}
export declare function readCardLayout(): Layout;
export declare function moveCard(order: readonly string[], source: string, target: string): string[];
export declare function AccountCards({ cards, t }: {
    cards: readonly AccountCard[];
    t: Translate<UsageKey>;
}): import("react").JSX.Element;
export {};
