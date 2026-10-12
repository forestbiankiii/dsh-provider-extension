import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProviderPanelKey } from './locales.ts';
export interface CodexImageFeaturesProps {
    rpc: ClientConnectionRpc;
    subscribe?: (listener: () => void) => () => void;
    t: Translate<ProviderPanelKey>;
}
export interface CodexImageFeatures {
    imageGeneration: boolean;
    imageEditing: boolean;
    writable: boolean;
}
export type CodexImageFeaturePatch = Partial<Pick<CodexImageFeatures, 'imageGeneration' | 'imageEditing'>>;
export declare function requestCodexImageFeatures(rpc: ClientConnectionRpc, patch?: CodexImageFeaturePatch, signal?: AbortSignal): Promise<CodexImageFeatures>;
export declare function CodexImageFeaturesSettings({ rpc, subscribe, t }: CodexImageFeaturesProps): import("react").JSX.Element;
