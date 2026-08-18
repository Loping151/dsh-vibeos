/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/stores/appStore.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

import { create } from 'zustand';
import type { AppDescriptor } from '../../shared/index';

interface AppStoreState {
  apps: Record<string, AppDescriptor>;
  setAll: (apps: AppDescriptor[]) => void;
  upsert: (app: AppDescriptor) => void;
  remove: (appId: string) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  apps: {},
  setAll: (apps) =>
    set(() => {
      const map: Record<string, AppDescriptor> = {};
      for (const a of apps) map[a.id] = a;
      return { apps: map };
    }),
  upsert: (app) => set((s) => ({ apps: { ...s.apps, [app.id]: app } })),
  remove: (appId) =>
    set((s) => {
      const apps = { ...s.apps };
      delete apps[appId];
      return { apps };
    }),
}));
