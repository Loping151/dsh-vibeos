import type { AppDescriptor } from '../../shared';
import type { VibeosBus } from '../agents/bus';
import type { WsGateway } from '../gateway/wsGateway';
import type { AppRepo } from '../state/repos/AppRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
export declare class WindowInitializer {
    private readonly deps;
    constructor(deps: {
        apps: AppRepo;
        windows: WindowRepo;
        memory: MemoryRepo;
        gateway: Pick<WsGateway, 'broadcast'>;
        bus: VibeosBus;
    });
    /**
     * Decide how a freshly-opened window gets its first content:
     *  - native preset app (Settings / Activity Monitor / App Store) → nothing (React renders it)
     *  - app with a frozen `seedHtml` → push that snapshot immediately
     *  - otherwise → an AI first render
     */
    renderInitialWindow(windowId: string, app: AppDescriptor): Promise<void>;
    /**
     * Cold start: on the very first boot, open the Welcome app so a fresh desktop
     * isn't empty. It's a normal native window — left open it persists across
     * refreshes/reboots, and once the user closes it it stays closed. Runs before
     * any client connects, so no broadcast.
     */
    openWelcomeOnFirstBoot(): Promise<void>;
}
