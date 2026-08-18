import type { Rect, WindowDisplayState, WindowKind, WindowState } from '../../../shared';
import type { CoreHandle } from '../domains';
import type { GeometryRepo } from './GeometryRepo';
import type { MemoryRepo } from './MemoryRepo';
export declare class WindowRepo {
    private readonly core;
    private readonly geometry;
    private readonly memory;
    private readonly table;
    constructor(core: CoreHandle, geometry: GeometryRepo, memory: MemoryRepo);
    listOpenWindows(): WindowState[];
    getWindow(id: string): WindowState | null;
    findOpenWindowByApp(appId: string): WindowState | null;
    private nextZ;
    private nextOrder;
    private unfocusAll;
    /** Geometry resolve order: explicit rect → remembered per-app rect → cascade. */
    openWindow(input: {
        appId: string;
        title: string;
        kind?: WindowKind;
        rect?: Rect;
        size?: {
            w: number;
            h: number;
        };
    }): Promise<WindowState>;
    closeWindow(id: string): Promise<void>;
    focusWindow(id: string): Promise<WindowState | null>;
    setWindowState(id: string, state: WindowDisplayState): Promise<WindowState | null>;
    moveWindow(id: string, rect: Rect): Promise<WindowState | null>;
    clearAll(): Promise<void>;
    /** Persist a new taskbar order (window ids left → right). */
    reorderWindows(ids: string[]): Promise<void>;
}
