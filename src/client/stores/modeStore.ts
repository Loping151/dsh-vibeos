/** Desktop-takeover vs classic (stock DSH) mode. The persisted truth is
 * settings.prefs.classicMode (all tabs converge via s2c.settings.changed);
 * localStorage only seeds the pre-connect guess. */

import { create } from 'zustand';

export type VibeosMode = 'desktop' | 'classic';

export const LAST_MODE_KEY = 'vibeos.lastMode';

function initialMode(): VibeosMode {
  try {
    return localStorage.getItem(LAST_MODE_KEY) === 'classic' ? 'classic' : 'desktop';
  } catch {
    return 'desktop';
  }
}

interface ModeState {
  mode: VibeosMode;
  set: (mode: VibeosMode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: initialMode(),
  set: (mode) => set({ mode }),
}));
