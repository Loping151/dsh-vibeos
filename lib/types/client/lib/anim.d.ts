import { type CSSProperties } from 'react';
export declare const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
export declare function useReducedMotion(): boolean;
export interface Presence {
    /** Keep the element in the tree (true until the exit transition ends). */
    mounted: boolean;
    /** Drives the "in" styles; false right after mount and during exit. */
    entered: boolean;
}
/** CSS-transition replacement for AnimatePresence: mount → next-frame enter → delayed unmount. */
export declare function usePresence(open: boolean, exitMs?: number): Presence;
/** Popovers / menus: subtle scale + fade. Pair with a transform-origin. */
export declare function popoverStyle(entered: boolean, reduced: boolean): CSSProperties;
/** Backdrops / overlays: plain fade. */
export declare function overlayStyle(entered: boolean): CSSProperties;
/** Windows opening/closing: gentle scale + fade from center. */
export declare function windowStyle(entered: boolean, reduced: boolean): CSSProperties;
