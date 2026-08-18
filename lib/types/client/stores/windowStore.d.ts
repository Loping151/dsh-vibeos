import type { WindowState } from '../../shared/index';
interface WindowStoreState {
    windows: Record<string, WindowState>;
    /** Per-window AI HTML snapshot (rendered content). */
    snapshots: Record<string, string>;
    /** Windows currently waiting on an AI response. */
    busy: Record<string, boolean>;
    setAll: (windows: WindowState[], snapshots: Record<string, string>) => void;
    upsert: (w: WindowState) => void;
    remove: (id: string) => void;
    reorder: (ids: string[]) => void;
    focus: (id: string) => void;
    setSnapshot: (id: string, html: string) => void;
    setBusy: (id: string, busy: boolean) => void;
    /** Window id being pointer-dragged/resized (geometry transitions pause). */
    dragging: string | null;
    setDragging: (id: string | null) => void;
}
export declare const useWindowStore: import("zustand").UseBoundStore<import("zustand").StoreApi<WindowStoreState>>;
export {};
