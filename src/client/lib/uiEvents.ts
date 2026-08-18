/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/lib/uiEvents.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): events dispatch on #vibeos-root, not window
 * (the plugin must not leak events onto the host page). Original license: MIT. */

import { getVibeosRoot } from './utils';

export const OPEN_SPOTLIGHT_EVENT = 'vibe:open-spotlight';

export interface OpenSpotlightDetail {
  /** Prefill the Spotlight input (e.g. "> make a calculator" for command mode). */
  query?: string;
}

/** Ask the Desktop to open Spotlight, optionally prefilled. */
export function requestSpotlight(query = ''): void {
  getVibeosRoot()?.dispatchEvent(
    new CustomEvent<OpenSpotlightDetail>(OPEN_SPOTLIGHT_EVENT, { detail: { query } }),
  );
}

/** Subscribe to Spotlight open requests (Desktop only; container-scoped). */
export function onOpenSpotlight(fn: (detail: OpenSpotlightDetail) => void): () => void {
  const root = getVibeosRoot();
  if (!root) return () => {};
  const handler = (e: Event) => fn((e as CustomEvent<OpenSpotlightDetail>).detail ?? {});
  root.addEventListener(OPEN_SPOTLIGHT_EVENT, handler);
  return () => root.removeEventListener(OPEN_SPOTLIGHT_EVENT, handler);
}
