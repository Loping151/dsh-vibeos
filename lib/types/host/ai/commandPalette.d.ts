import type { AppDescriptor, Syscall, WindowState } from '../../shared';
import type { SdkManager } from './SdkManager';
export interface CommandPaletteDeps {
    listApps(): AppDescriptor[];
    listOpenWindows(): WindowState[];
}
/**
 * Interpret a natural-language command into a batch of syscalls. The caller
 * executes them. A newer command aborts this one (abort → empty batch).
 */
export declare class CommandPalette {
    private readonly sdk;
    private readonly deps;
    constructor(sdk: SdkManager, deps: CommandPaletteDeps);
    runCommand(text: string, abort?: AbortController): Promise<Syscall[]>;
    /** Compact snapshot of what the command can act on (installed apps, open windows). */
    private systemContext;
}
