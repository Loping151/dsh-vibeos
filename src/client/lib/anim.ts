/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/lib/motion.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): the motion library is replaced by CSS transitions;
 * durations/eases and the reduced-motion fallbacks are kept. Original license: MIT. */

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';

export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduced(fn: () => void): () => void {
  if (typeof matchMedia === 'undefined') return () => {};
  const mq = matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}

function reducedSnapshot(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia(REDUCED_QUERY).matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, reducedSnapshot, () => false);
}

export interface Presence {
  /** Keep the element in the tree (true until the exit transition ends). */
  mounted: boolean;
  /** Drives the "in" styles; false right after mount and during exit. */
  entered: boolean;
}

/** CSS-transition replacement for AnimatePresence: mount → next-frame enter → delayed unmount. */
export function usePresence(open: boolean, exitMs = 180): Presence {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setEntered(true)),
      );
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);
  return { mounted, entered };
}

/** Popovers / menus: subtle scale + fade. Pair with a transform-origin. */
export function popoverStyle(entered: boolean, reduced: boolean): CSSProperties {
  if (reduced) {
    return { opacity: entered ? 1 : 0, transition: 'opacity 0.12s' };
  }
  return {
    opacity: entered ? 1 : 0,
    transform: entered ? 'scale(1)' : 'scale(0.96)',
    transition: `opacity 0.18s ${EASE_OUT}, transform 0.18s ${EASE_OUT}`,
  };
}

/** Backdrops / overlays: plain fade. */
export function overlayStyle(entered: boolean): CSSProperties {
  return { opacity: entered ? 1 : 0, transition: 'opacity 0.15s' };
}

/** Windows opening/closing: gentle scale + fade from center. */
export function windowStyle(entered: boolean, reduced: boolean): CSSProperties {
  if (reduced) {
    return { opacity: entered ? 1 : 0, transition: 'opacity 0.12s' };
  }
  return {
    opacity: entered ? 1 : 0,
    transform: entered ? 'scale(1)' : 'scale(0.97)',
    transition: `opacity 0.16s ${EASE_OUT}, transform 0.16s ${EASE_OUT}`,
  };
}
