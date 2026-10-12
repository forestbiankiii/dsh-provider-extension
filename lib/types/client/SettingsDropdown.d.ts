interface Props {
    label: string;
    value: string;
    choices: readonly string[];
    labels: readonly string[];
    disabled?: boolean;
    onChange(value: string): void;
}
export declare function SettingsDropdown({ label, value, choices, labels, disabled, onChange }: Props): import("react").JSX.Element;
export {};
