import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProviderPanelKey } from './locales.ts';
import type { CodexImageAnnotation } from './codex-image-annotations.ts';
import { type Point } from './image-studio-model.ts';
export interface ImageEditRequest {
    annotations?: readonly CodexImageAnnotation[];
    prompt?: string;
    source?: File;
    extra?: File[];
    width?: number;
    height?: number;
}
interface Stroke {
    size: number;
    points: Point[];
}
export declare function drawEraseMask(c: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, mask: boolean): void;
export declare function CodexImageViewer({ src, width, height, name, t, onClose, onDownload, onStage, onSketch, annotations, onAnnotations, initialMark, canEdit, canAnnotate, canSketch }: {
    src: string;
    width: number;
    height: number;
    name: string;
    t: Translate<ProviderPanelKey>;
    onClose: () => void;
    onDownload: () => Promise<void>;
    onStage: (request: ImageEditRequest) => Promise<void>;
    onSketch: () => void;
    annotations: CodexImageAnnotation[];
    onAnnotations: (marks: CodexImageAnnotation[]) => void;
    initialMark?: boolean;
    canEdit?: boolean;
    canAnnotate?: boolean;
    canSketch?: boolean;
}): import("react").JSX.Element;
export {};
