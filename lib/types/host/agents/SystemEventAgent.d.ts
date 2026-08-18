import type { SdkManager } from '../ai/SdkManager';
import type { KernelState } from '../kernel/kernelState';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { SyscallInterpreter } from '../syscall/SyscallInterpreter';
import type { TimerAgent } from './scheduler';
/**
 * Ambient daemon: periodically invents small believable system events
 * (notifications) so the OS feels alive. Uses the fast model.
 */
export declare class SystemEventAgent implements TimerAgent {
    private readonly deps;
    readonly role: "system-event";
    constructor(deps: {
        windows: WindowRepo;
        kernelState: KernelState;
        sdk: SdkManager;
        syscalls: SyscallInterpreter;
    });
    tick(): Promise<void>;
}
