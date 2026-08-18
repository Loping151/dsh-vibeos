import { type ReactNode } from 'react';
interface SpotlightState {
    open: boolean;
    /** Seeded on open (e.g. "> make a calculator" from Welcome). */
    query: string;
    openWith: (query?: string) => void;
    toggle: () => void;
    close: () => void;
}
/** Shared with the desktop (keyboard shortcut + the open-spotlight ui event). */
export declare const useSpotlightStore: import("zustand").UseBoundStore<import("zustand").StoreApi<SpotlightState>>;
export declare function Spotlight(props: {
    open: boolean;
    onClose: () => void;
}): ReactNode;
export {};
