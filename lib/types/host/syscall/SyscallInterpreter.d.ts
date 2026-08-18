import type { Syscall } from '../../shared';
import type { VibeosBus } from '../agents/bus';
import type { WsGateway } from '../gateway/wsGateway';
import type { WindowService } from '../kernel/windows';
import type { AppRepo } from '../state/repos/AppRepo';
import type { NotificationRepo } from '../state/repos/NotificationRepo';
import type { VfsRepo } from '../state/repos/VfsRepo';
export interface SyscallContext {
    /** Window that produced these syscalls (for source attribution). */
    windowId?: string;
    appId?: string;
    source: 'syscall' | 'agent' | 'system';
}
export declare class SyscallInterpreter {
    private readonly deps;
    constructor(deps: {
        gateway: Pick<WsGateway, 'broadcast'>;
        bus: VibeosBus;
        apps: AppRepo;
        vfs: VfsRepo;
        notifications: NotificationRepo;
        windowService: WindowService;
    });
    /** Per-call errors are logged and swallowed — one bad call never kills a batch. */
    execute(calls: readonly Syscall[], ctx: SyscallContext): Promise<void>;
    private one;
}
