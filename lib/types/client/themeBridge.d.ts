/** DSH chrome bridge: while desktop mode is active and the skin ships dswTokens
 * (and settings.prefs.bridgeDshTheme !== false), overlay them on the DSH theme
 * via ctx.theme.overrideTokens('dsh-vibeos', …). Disposed on skin change,
 * classic switch, and plugin dispose — classic mode is instantly stock. */
import type { Context } from '@deepseek-ai/cordis';
declare class ThemeBridge {
    private ctx;
    private applied;
    private appliedTokens;
    private unsubs;
    init(ctx: Context): void;
    reevaluate(): void;
    dispose(): void;
}
export declare const themeBridge: ThemeBridge;
export {};
