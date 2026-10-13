import { type ReactNode } from 'react';
/** Native top-layer dialog supplies focus trapping, inert background and Escape. */
export declare function StudioDialog({ title, children, onClose, sketch, busy }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    sketch?: boolean;
    busy?: boolean;
}): import("react").JSX.Element;
export declare function StudioIcon({ name }: {
    name: string;
}): import("react").JSX.Element;
