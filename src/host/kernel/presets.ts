/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/AppRepo.ts (PRESETS).
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

import type { AppManifest, PresetAppId } from '../../shared';

export interface PresetAppDefinition {
  id: PresetAppId;
  name: string;
  /** Icon registry name (lucide vocabulary), rendered by <AppIcon>. */
  icon: string;
  manifest: AppManifest;
}

export const PRESET_APPS: readonly PresetAppDefinition[] = [
  {
    id: 'browser',
    name: 'Browser',
    icon: 'globe',
    manifest: {
      description: 'A web browser into the hallucinated internet.',
      category: 'system',
      defaultSize: { w: 880, h: 600 },
      chrome: 'browser',
    },
  },
  {
    id: 'command-line',
    name: 'Terminal',
    icon: 'square-terminal',
    manifest: {
      description: 'A command line into the VibeOS shell.',
      category: 'system',
      defaultSize: { w: 720, h: 460 },
      chrome: 'terminal',
    },
  },
  {
    id: 'file-manager',
    name: 'Files',
    icon: 'folder',
    manifest: {
      description: 'Browse the virtual filesystem.',
      category: 'system',
      defaultSize: { w: 760, h: 520 },
    },
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: 'settings',
    manifest: {
      description: 'System settings.',
      category: 'system',
      defaultSize: { w: 900, h: 620 },
      minSize: { w: 850, h: 480 },
      singleInstance: true,
    },
  },
  {
    id: 'activity-monitor',
    name: 'Activity Monitor',
    icon: 'activity',
    manifest: {
      description: 'Live view of AI agent runs, models, latency and token cost.',
      category: 'system',
      defaultSize: { w: 720, h: 560 },
      singleInstance: true,
    },
  },
  {
    id: 'app-store',
    name: 'App Store',
    icon: 'layout-grid',
    manifest: {
      description: 'Browse, install, export and share apps.',
      category: 'system',
      defaultSize: { w: 820, h: 580 },
      singleInstance: true,
    },
  },
  {
    id: 'recycle-bin',
    name: 'Recycle Bin',
    icon: 'trash-2',
    manifest: {
      description: "Restore or permanently delete items you've thrown away.",
      category: 'system',
      defaultSize: { w: 640, h: 500 },
      singleInstance: true,
    },
  },
  {
    id: 'welcome',
    name: 'Welcome',
    icon: 'hand-waving',
    manifest: {
      // Width matches the client's content column so its self-fit measurement is accurate.
      description: 'Get started with VibeOS — try generating your first app.',
      category: 'system',
      defaultSize: { w: 460, h: 500 },
      singleInstance: true,
    },
  },
];

export function presetById(id: string): PresetAppDefinition | undefined {
  return PRESET_APPS.find((p) => p.id === id);
}
