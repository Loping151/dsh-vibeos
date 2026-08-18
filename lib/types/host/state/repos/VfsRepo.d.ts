import type { VfsLocation, VfsNode, VfsNodeType } from '../../../shared';
import type { CoreHandle } from '../domains';
export declare class VfsRepo {
    private readonly core;
    private readonly table;
    constructor(core: CoreHandle);
    listByLocation(location: VfsLocation): VfsNode[];
    getNode(id: string): VfsNode | null;
    private gridSlot;
    createNode(input: {
        name: string;
        type: VfsNodeType;
        mime?: string;
        content?: string;
        targetAppId?: string;
        location?: VfsLocation;
        meta?: Record<string, unknown>;
    }): Promise<VfsNode>;
    /** Moving into the recycle bin is the soft delete; x/y keep their old value when omitted. */
    moveNode(input: {
        nodeId: string;
        location: VfsLocation;
        x?: number;
        y?: number;
        parentId?: string;
    }): Promise<VfsNode | null>;
    listByTargetApp(appId: string): VfsNode[];
    deleteNode(nodeId: string): Promise<boolean>;
    emptyRecycleBin(): Promise<string[]>;
    clearAll(): Promise<void>;
    /** Desktop shortcut to an app; idempotent by target app. */
    ensureShortcut(appId: string, name: string, icon?: string): Promise<VfsNode | null>;
}
