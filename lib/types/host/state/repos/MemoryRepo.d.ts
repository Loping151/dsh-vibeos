import type { AppMemory, Interaction } from '../../../shared';
import type { MemoryHandle } from '../domains';
export declare class MemoryRepo {
    private readonly handle;
    private readonly memory;
    private readonly interactions;
    constructor(handle: MemoryHandle);
    getMemory(windowId: string): AppMemory | null;
    getSnapshot(windowId: string): string;
    ensureMemory(windowId: string, appId: string): Promise<void>;
    /** Shifts the current snapshot into the single undo slot before writing. */
    saveSnapshot(windowId: string, html: string): Promise<void>;
    /**
     * Swap current and previous snapshots (self-inverse: undo and redo are the
     * same operation). Returns the new current html, or undefined without prev.
     */
    swapSnapshot(windowId: string): Promise<string | undefined>;
    saveSummary(windowId: string, summary: string): Promise<void>;
    private patch;
    /** Oldest-first, last {@link RECENT_LIMIT} ops. */
    recentInteractions(windowId: string): Interaction[];
    addInteraction(input: {
        windowId: string;
        opKind: string;
        opPayload: unknown;
        resultSummary?: string;
    }): Promise<void>;
    /** Window close is a hard delete: drop the snapshot and the op log with it. */
    forget(windowId: string): Promise<void>;
    clearAll(): Promise<void>;
}
