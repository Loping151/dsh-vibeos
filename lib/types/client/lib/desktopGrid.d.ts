import type { VfsNode } from '../../shared/index';
/** Desktop icon grid — shared by drag-snap and auto-arrange. */
export declare const GRID_ORIGIN = 16;
export declare const GRID_COL = 96;
export declare const GRID_ROW = 104;
/** Snap a free position to the nearest grid cell. */
export declare function snapToGrid(x: number, y: number): {
    x: number;
    y: number;
};
/** Position for the nth icon, filling columns top→bottom then wrapping right. */
export declare function gridPosition(index: number, viewportH: number): {
    x: number;
    y: number;
};
/** Grid placements for a node list (pure — caller upserts + sends c2s.vfs.move). */
export declare function autoArrange(nodes: VfsNode[], viewportH: number): Array<{
    nodeId: string;
    x: number;
    y: number;
}>;
