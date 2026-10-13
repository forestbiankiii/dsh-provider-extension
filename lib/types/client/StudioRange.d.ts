/** Keep native range semantics and keyboard behavior; only presentation is shared. */
export declare function StudioRange({ label, min, max, step, value, valueText, onChange }: {
    label: string;
    min: number;
    max: number;
    step?: number;
    value: number;
    valueText?: string;
    onChange: (value: number) => void;
}): import("react").JSX.Element;
