import type { SdkManager } from '../ai/SdkManager';
import type { AppRepo } from '../state/repos/AppRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { RunRepo } from '../state/repos/RunRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { TimerAgent } from './scheduler';
/**
 * Background consolidation: folds each open window's recent interactions into a
 * tighter episode summary, and prunes old agent runs. Uses the fast model.
 */
export declare class MaintenanceAgent implements TimerAgent {
    private readonly deps;
    readonly role: "maintenance";
    constructor(deps: {
        windows: WindowRepo;
        apps: AppRepo;
        memory: MemoryRepo;
        runs: RunRepo;
        sdk: SdkManager;
        runHistory: number;
    });
    tick(): Promise<void>;
}
