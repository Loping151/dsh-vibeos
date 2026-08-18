/** ModeManager: desktop mode shadows the 'root' single slot at priority -10
 * (lowest renders — ui-layout's AppFrame sits at 0); classic mode disposes that
 * registration and parks a return pill in 'shell.overlay'. The pill registration
 * goes through ctx.slots.inject because shell.overlay is DECLARED by AppFrame,
 * which only exists while root is not shadowed (declaration-collapse safety). */
import type { ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
export declare function VibeDesktopRoot(): ReactNode;
export interface ModeManager {
    dispose(): void;
}
export declare function createModeManager(ctx: Context): ModeManager;
