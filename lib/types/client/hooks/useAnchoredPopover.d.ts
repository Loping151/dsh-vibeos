import { type CSSProperties } from 'react';
/**
 * Position a popover above its trigger button (found by selector), so it follows
 * the button wherever a skin puts it (taskbar corner, centered Dock, …). Returns
 * a fixed-position style; recomputes on open and on resize.
 *
 * Pair with skipping the same selector in the popover's outside-click handler so
 * clicking the trigger toggles it closed instead of close-then-reopen.
 */
export declare function useAnchoredPopover(open: boolean, triggerSelector: string, align: 'left' | 'right', width?: number): CSSProperties;
