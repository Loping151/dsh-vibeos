/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/lib/utils.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): tailwind-merge dropped (utilities are precompiled;
 * no conflicting runtime class merging needed). Original license: MIT. */

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** The desktop container every DOM query/portal must stay inside. */
export const VIBEOS_ROOT_ID = 'vibeos-root';

export function getVibeosRoot(): HTMLElement | null {
  return document.getElementById(VIBEOS_ROOT_ID);
}
