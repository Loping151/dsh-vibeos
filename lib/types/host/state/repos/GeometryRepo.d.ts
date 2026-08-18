import type { Rect, WindowState } from '../../../shared';
import type { CoreHandle } from '../domains';
export declare class GeometryRepo {
    private readonly core;
    private readonly table;
    constructor(core: CoreHandle);
    getGeometry(appId: string): Rect | null;
    rememberGeometry(appId: string, r: Rect): Promise<void>;
    clearAll(): Promise<void>;
    /** Widgets and transient launches have no app identity worth remembering. */
    rememberForWindow(win: WindowState, r: Rect): Promise<void>;
}
