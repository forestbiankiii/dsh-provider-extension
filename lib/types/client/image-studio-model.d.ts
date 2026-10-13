export type Point = {
    x: number;
    y: number;
};
export type DrawTool = 'select' | 'pan' | 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'object-eraser' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'curve' | 'text';
export interface DrawingObject {
    id: string;
    kind: DrawTool | 'image';
    points: Point[];
    color: string;
    width: number;
    opacity: number;
    x: number;
    y: number;
    scale: number;
    text?: string;
    data?: string;
    imageWidth?: number;
    imageHeight?: number;
}
export interface DrawingLayer {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    objects: DrawingObject[];
}
export interface DrawingDocument {
    version: 1;
    width: number;
    height: number;
    background: string;
    layers: DrawingLayer[];
}
export interface SavedDrawing {
    id: string;
    name: string;
    updated: number;
    document: DrawingDocument;
}
export declare const newDrawing: () => DrawingDocument;
export declare const clamp: (n: number, min: number, max: number) => number;
export declare function imagePoint(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Point;
export declare function smoothPoints(points: Point[], amount: number): Point[];
export declare function insideImage(x: number, y: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): boolean;
export declare function objectBounds(o: DrawingObject): {
    x: number;
    y: number;
    width: number;
    height: number;
};
export declare function hitObject(o: DrawingObject, p: Point): boolean;
export declare function decodeDrawing(value: unknown): DrawingDocument;
export declare function renderDrawing(d: DrawingDocument, canvas: HTMLCanvasElement, images?: Map<string, HTMLImageElement>): Promise<void>;
export declare function canvasPng(canvas: HTMLCanvasElement): Promise<File>;
export declare function imageFile(file: File): Promise<DrawingObject>;
export declare function downloadBlob(blob: Blob, name: string): void;
export declare const DRAWING_STORAGE = "dpe:sketch-drafts:v1";
export declare function loadDrawings(storage: Pick<Storage, 'getItem'>): SavedDrawing[];
export declare function saveDrawing(storage: Pick<Storage, 'getItem' | 'setItem'>, item: SavedDrawing): SavedDrawing[];
