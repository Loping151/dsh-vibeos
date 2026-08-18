/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/stores/settingsStore.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): documentElement side effects dropped — theme class,
 * data-skin and lang render reactively on #vibeos-root; skin changes route through the skin
 * registry (which re-evaluates the DSH theme bridge). Original license: MIT. */

import { create } from 'zustand';
import type { Settings } from '../../shared/index';
import { DEFAULT_SKIN } from '../../shared/index';
import { applySkin } from '../registry/skins';

interface SettingsStoreState {
  settings: Settings | null;
  set: (settings: Settings) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: null,
  set: (settings) => {
    applySkin(settings.skin ?? DEFAULT_SKIN);
    set({ settings });
  },
}));
