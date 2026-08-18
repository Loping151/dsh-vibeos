import type { AppDescriptor, Rect, WindowKind, WindowState } from '../../shared';
import type { VibeosBus } from '../agents/bus';
import type { WsGateway } from '../gateway/wsGateway';
import type { AppRepo } from '../state/repos/AppRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { WindowInitializer } from './windowInit';
export declare class WindowService {
    private readonly deps;
    constructor(deps: {
        apps: AppRepo;
        windows: WindowRepo;
        memory: MemoryRepo;
        gateway: Pick<WsGateway, 'broadcast'>;
        bus: VibeosBus;
        init: WindowInitializer;
    });
    /**
     * Single-instance apps focus their existing window; multi-instance apps
     * (browser / files / terminal / virtual apps) open a fresh window each time.
     */
    openApp(app: AppDescriptor): Promise<void>;
    /**
     * Open the app's window if not already open; returns the window id (or null).
     * No first-render emit for an already-rendered window — the caller drives
     * generation via an op.
     */
    ensureOpenWindow(appId: string): Promise<string | null>;
    /** Open + announce a window whose content the caller seeds (spawn/launch paths). */
    openSeeded(input: {
        appId: string;
        title: string;
        kind: WindowKind;
        rect: Rect;
    }): Promise<WindowState>;
    /** Close = abort any in-flight generation, hard-delete, announce. */
    close(windowId: string): Promise<void>;
    focus(windowId: string): Promise<void>;
}
