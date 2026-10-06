import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { ClaudeClientState } from './providers/claude.ts';
import type { ProviderPanelKey } from './locales.ts';
export declare function ClaudeSettings({ state, load, login, loadModels, t }: {
    state?: ClaudeClientState | undefined;
    load?: (() => Promise<void>) | undefined;
    login?: (() => Promise<void>) | undefined;
    loadModels?: (() => Promise<readonly {
        id: string;
        name: string;
    }[]>) | undefined;
    t: Translate<ProviderPanelKey>;
}): import("react").JSX.Element;
