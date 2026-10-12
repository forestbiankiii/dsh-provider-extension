/** Native config owner for the user-controlled Codex image tool switches. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export interface CodexImageFeatures {
    imageGeneration: boolean;
    imageEditing: boolean;
}
export type CodexImageFeaturesConfig = CodexImageFeatures | {
    get(): CodexImageFeatures;
};
export declare const codexImageFeaturesSchema: Schema<Schemastery.ObjectS<{
    imageGeneration: Schema<boolean, boolean>;
    imageEditing: Schema<boolean, boolean>;
}>, Schemastery.ObjectT<{
    imageGeneration: Schema<boolean, boolean>;
    imageEditing: Schema<boolean, boolean>;
}>>;
export declare function createCodexImageFeaturesOwner(ctx: Context, config?: CodexImageFeaturesConfig, readLegacy?: () => Record<string, unknown>): {
    current: () => CodexImageFeatures;
    writable: boolean;
    save(input: CodexImageFeatures, signal?: AbortSignal): Promise<void>;
};
