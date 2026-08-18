/** Hand-rolled pointer-based horizontal list reorder (replaces motion's
 * Reorder.Group/Reorder.Item for the taskbar). Drag activates past a 4px
 * threshold so plain clicks still reach the item; siblings shift with a CSS
 * transition; the proposed order is committed once on pointerup. */
import { type CSSProperties } from 'react';
export interface ListReorderApi {
    /** Attach as ref={refFor(id)} on each item. */
    refFor: (id: string) => (el: HTMLElement | null) => void;
    /** Attach as onPointerDown={handlePointerDown(id)} on each item. */
    handlePointerDown: (id: string) => (e: React.PointerEvent) => void;
    /** Per-item transform/transition while dragging. */
    styleFor: (id: string) => CSSProperties;
    /** Attach as onClickCapture on each item: swallows the click after a drag. */
    onClickCapture: (e: React.MouseEvent) => void;
    draggingId: string | null;
}
export declare function useListReorder(ids: readonly string[], onCommit: (ids: string[]) => void): ListReorderApi;
