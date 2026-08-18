/** System reset: wipe the desktop session (windows, apps, vfs, memory, runs,
 * notifications, kernel state) while keeping settings, then replay the
 * first-boot path and tell every client to re-hello. */
import type { UiGenerationAgent } from '../agents/UiGenerationAgent';
import type { WsGateway } from '../gateway/wsGateway';
import type { AppRepo } from '../state/repos/AppRepo';
import type { GeometryRepo } from '../state/repos/GeometryRepo';
import type { KernelRepo } from '../state/repos/KernelRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { NotificationRepo } from '../state/repos/NotificationRepo';
import type { RunRepo } from '../state/repos/RunRepo';
import type { VfsRepo } from '../state/repos/VfsRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { VibeosDomains } from '../state/domains';
import type { ArchiveRecord } from '../state/domains';
import type { KernelState } from './kernelState';
import type { WindowInitializer } from './windowInit';
export declare class SystemResetService {
    private readonly deps;
    constructor(deps: {
        gateway: Pick<WsGateway, 'broadcast'>;
        uiAgent: UiGenerationAgent;
        kernelRepo: KernelRepo;
        kernelState: KernelState;
        apps: AppRepo;
        windows: WindowRepo;
        vfs: VfsRepo;
        geometry: GeometryRepo;
        memory: MemoryRepo;
        runs: RunRepo;
        notifications: NotificationRepo;
        windowInit: WindowInitializer;
        domains: VibeosDomains;
    });
    /** Snapshot the live session into the archive ring (skipped when empty). */
    private archiveCurrent;
    listArchives(): Array<{
        id: string;
        archivedAt: number;
        windows: number;
        apps: number;
    }>;
    /** Raw archive record for download. */
    exportArchive(id: string): ArchiveRecord | undefined;
    /** Adopt an archive file produced by exportArchive. */
    importArchive(json: string): Promise<boolean>;
    /** Swap an archived session back in (the current one is archived first). */
    restore(id: string): Promise<boolean>;
    reset(): Promise<void>;
}
