/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/domain/settings.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): providers/api keys/image models dropped (DSH owns routing),
 * skin is an open string, model overrides are per-role ModelRef. Original license: MIT. */

import type { ModelRef } from './models';
import { DEFAULT_SKIN } from './skin';

export type Theme = 'light' | 'dark';

/** UI + generated-content language. */
export type Locale = 'zh' | 'en';

export const DEFAULT_LOCALE: Locale = 'zh';

export interface ModelOverrides {
  ui?: ModelRef;
  fast?: ModelRef;
}

export interface Preferences {
  /** Disable the proactive system-event agent. */
  proactiveAgents?: boolean;
  /** Desktop wallpaper: a `/vibeos/img/:id` path, or empty for the default brand gradient. */
  wallpaper?: string;
  /** Stock DSH shell instead of the desktop takeover. */
  classicMode?: boolean;
  /** Apply the active skin's dswTokens to DSH chrome while desktop mode is active. */
  bridgeDshTheme?: boolean;
  /** Terminal prompt identity (user@host); falls back to the plugin config. */
  terminalPrompt?: string;
  /** Preferred visual style for generated app UIs; injected into every generation prompt. */
  stylePrompt?: string;
  /** Ambient agent intervals (ms); the host clamps to safe minimums. */
  agentIntervals?: { systemEventMs?: number; maintenanceMs?: number };
  [k: string]: unknown;
}

export interface Settings {
  theme: Theme;
  /** Visual skin id; validated against the client skin registry, not the wire. */
  skin?: string;
  /**
   * Undefined means "not chosen yet" — the client follows the browser (falling
   * back to {@link DEFAULT_LOCALE}) and persists its choice on first boot.
   */
  locale?: Locale;
  /**
   * Free-text profile the user writes about themselves. Injected into every
   * generation so hallucinated apps feel personalized across windows.
   */
  userProfile?: string;
  modelOverrides: ModelOverrides;
  prefs: Preferences;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  skin: DEFAULT_SKIN,
  locale: DEFAULT_LOCALE,
  modelOverrides: {},
  prefs: {},
  updatedAt: 0,
};
