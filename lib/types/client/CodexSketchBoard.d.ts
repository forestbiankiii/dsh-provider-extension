import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProviderPanelKey } from './locales.ts';
export declare function CodexSketchBoard({ t, onClose, onAttach, src, sessionKey }: {
    t: Translate<ProviderPanelKey>;
    onClose: () => void;
    onAttach: (file: File, width: number, height: number) => Promise<void>;
    src?: string;
    sessionKey?: string;
}): import("react").JSX.Element;
