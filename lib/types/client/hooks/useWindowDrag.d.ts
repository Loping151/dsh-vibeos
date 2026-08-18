/** Resize direction: any combination of edges. "move" = move. */
export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
/** Pointer-based move/resize that updates the store live and persists on release. */
export declare function useWindowDrag(windowId: string): {
    onMoveHandle: (e: React.PointerEvent) => void;
    onResize: (dir: ResizeDir) => (e: React.PointerEvent) => void;
};
