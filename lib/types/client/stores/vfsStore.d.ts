import type { VfsNode } from '../../shared/index';
interface VfsStoreState {
    nodes: Record<string, VfsNode>;
    setAll: (nodes: VfsNode[]) => void;
    upsert: (node: VfsNode) => void;
    remove: (ids: string[]) => void;
    desktop: () => VfsNode[];
    recyclebin: () => VfsNode[];
}
export declare const useVfsStore: import("zustand").UseBoundStore<import("zustand").StoreApi<VfsStoreState>>;
export {};
