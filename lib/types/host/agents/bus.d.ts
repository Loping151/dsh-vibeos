import type { AiOp, DragPayload, DropTarget } from '../../shared';
export interface BusEvents {
    /** A user operation arrived inside a window — drives UI generation. */
    'op.received': {
        windowId: string;
        op: AiOp;
    };
    'op.dragdrop': {
        windowId?: string;
        source: DragPayload;
        target: DropTarget;
    };
    /** A window was opened and needs its first AI render. */
    'window.firstRender': {
        windowId: string;
    };
    /** A window spawned by the AI with a specific seed prompt for its content. */
    'window.spawnRender': {
        windowId: string;
        seedPrompt: string;
    };
    /** A window was closed — any in-flight generation for it must be aborted. */
    'window.closed': {
        windowId: string;
    };
    /** Abort a window's in-flight generation without closing it (undo/redo). */
    'window.abortRender': {
        windowId: string;
    };
}
export declare class VibeosBus {
    private readonly ee;
    constructor();
    emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void;
    on<K extends keyof BusEvents>(type: K, fn: (payload: BusEvents[K]) => void): () => void;
}
