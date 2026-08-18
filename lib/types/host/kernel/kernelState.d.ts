import type { KernelRepo } from '../state/repos/KernelRepo';
import type { SettingsRepo } from '../state/repos/SettingsRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
/**
 * In-memory mirror of the global system state the AI gets to "see".
 * Write-through to storage. Kept compact — it goes into every prompt.
 */
export declare class KernelState {
    private readonly kernel;
    private readonly windows;
    private readonly settings;
    bootCount: number;
    private global;
    constructor(kernel: KernelRepo, windows: WindowRepo, settings: SettingsRepo);
    load(): void;
    setBootCount(n: number): void;
    get(): Record<string, unknown>;
    patch(partial: Record<string, unknown>): Promise<void>;
    /** Compact snapshot for the prompt: time, theme, open windows. */
    snapshotForPrompt(): Record<string, unknown>;
}
