import type { CoreHandle, KernelRecord } from '../domains';
export declare class KernelRepo {
    private readonly core;
    constructor(core: CoreHandle);
    loadKernel(): KernelRecord;
    recordBoot(): Promise<KernelRecord>;
    /** System reset: fresh session, first-boot counter, empty global state. */
    resetKernel(): Promise<KernelRecord>;
    /** Swap in an archived session's identity + global state (boot count kept). */
    restoreSession(globalState: Record<string, unknown>, sessionId: string): Promise<void>;
    saveGlobalState(globalState: Record<string, unknown>): Promise<void>;
}
