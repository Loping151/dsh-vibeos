import type { SdkManager } from '../ai/SdkManager';
import type { Config } from '../config';
import type { WebToolRuntime } from '../ai/webTools';
import type { WsGateway } from '../gateway/wsGateway';
import type { KernelState } from '../kernel/kernelState';
import type { AppRepo } from '../state/repos/AppRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { SettingsRepo } from '../state/repos/SettingsRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { SyscallInterpreter } from '../syscall/SyscallInterpreter';
import type { VibeosBus } from './bus';
export declare class UiGenerationAgent {
    private readonly deps;
    private readonly inflight;
    private readonly genCounter;
    constructor(deps: {
        bus: VibeosBus;
        gateway: Pick<WsGateway, 'broadcast'>;
        windows: WindowRepo;
        apps: AppRepo;
        memory: MemoryRepo;
        settings: SettingsRepo;
        kernelState: KernelState;
        sdk: SdkManager;
        syscalls: SyscallInterpreter;
        config: Config;
        webTools?: WebToolRuntime;
    });
    register(): () => void;
    private dispatch;
    /** Stop every in-flight generation (system reset). */
    /** Prompt identity: user setting wins over the deployment config. */
    private promptId;
    abortAll(): void;
    /**
     * Stop the in-flight generation for a window (e.g. when it's closed). Bumping
     * the generation counter makes any straggler result count as stale and commit
     * nothing.
     */
    private abortWindow;
    /** True if this run has been superseded by a newer one for the same window. */
    private isStale;
    private generate;
}
