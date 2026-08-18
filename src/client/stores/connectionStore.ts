/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/stores/connectionStore.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): provider/model discovery replaced by the resolved
 * role models + the DSH catalog (s2c.models.info); boot features kept for the mode manager.
 * Original license: MIT. */

import { create } from 'zustand';
import type {
  BootPhase,
  BootStatePayload,
  CatalogProvider,
  EffectiveModels,
} from '../../shared/index';

export type BootFeatures = BootStatePayload['features'];

interface ConnectionState {
  connected: boolean;
  bootPhase: BootPhase;
  bootCount: number;
  version: string;
  effective: EffectiveModels | null;
  catalog: CatalogProvider[];
  features: BootFeatures | null;
  setConnected: (v: boolean) => void;
  setBootPhase: (p: BootPhase) => void;
  setBootInfo: (info: {
    bootCount: number;
    version: string;
    effective: EffectiveModels;
    features: BootFeatures;
  }) => void;
  setModelsInfo: (info: { effective: EffectiveModels; catalog: CatalogProvider[] }) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: false,
  bootPhase: 'connecting',
  bootCount: 0,
  version: '',
  effective: null,
  catalog: [],
  features: null,
  setConnected: (v) => set({ connected: v }),
  setBootPhase: (p) => set({ bootPhase: p }),
  setBootInfo: (info) =>
    set({
      bootCount: info.bootCount,
      version: info.version,
      effective: info.effective,
      features: info.features,
    }),
  setModelsInfo: (info) => set({ effective: info.effective, catalog: info.catalog }),
}));
