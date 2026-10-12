import type { ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment';
export interface CodexImageAnnotation {
    readonly x: number;
    readonly y: number;
    readonly note: string;
}
export declare function normalizeCodexImageAnnotations(value: readonly CodexImageAnnotation[]): CodexImageAnnotation[];
interface AnnotationRenderOptions {
    readonly createImageBitmap?: (source: Blob) => Promise<ImageBitmap>;
    readonly createCanvas?: (width: number, height: number) => HTMLCanvasElement;
    readonly expectedWidth?: number;
    readonly expectedHeight?: number;
}
/** Render a numbered location-reference PNG without changing the clean source Blob. */
export declare function createCodexLocationReference(source: Blob, annotations: readonly CodexImageAnnotation[], limits: ImageAttachmentLimits, maximumBytes: number, options?: AnnotationRenderOptions): Promise<File>;
export {};
