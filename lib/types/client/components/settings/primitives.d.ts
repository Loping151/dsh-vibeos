import { type ReactNode } from 'react';
import type { ModelRole } from '../../../shared/index';
/** The two roles the host resolves models for (§B.4 modelPolicy). */
export declare const MODEL_ROLES: ModelRole[];
export declare function Pane({ title, action, children, }: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function GroupLabel({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function Group({ children, className }: {
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function Row({ label, hint, children, }: {
    label: string;
    hint?: string;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function Select({ value, onChange, children, className, }: {
    value: string;
    onChange: (v: string) => void;
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function Segmented<T extends string>({ value, onChange, options, }: {
    value: T;
    onChange: (v: T) => void;
    options: {
        value: T;
        label: string;
        icon?: ReactNode;
    }[];
}): import("react").JSX.Element;
export declare function Switch({ checked, onChange, }: {
    checked: boolean;
    onChange: (v: boolean) => void;
}): import("react").JSX.Element;
export interface ComboOption {
    value: string;
    label: string;
    /** Sub-label shown under the label (e.g. the raw model id). */
    sub?: string;
    /** Group header this option falls under (contiguous options are grouped). */
    group?: string;
}
/** Searchable single-select — used for the model picker (lists can be huge). */
export declare function Combobox({ value, options, onChange, searchPlaceholder, emptyLabel, }: {
    value: string;
    options: ComboOption[];
    onChange: (v: string) => void;
    searchPlaceholder: string;
    emptyLabel: string;
}): import("react").JSX.Element;
