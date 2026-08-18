/** The public client API other plugins reach via require('dsh-vibeos/client').vibeos.
 * Module-level registries exist before any apply runs; the stores behind them are
 * useSyncExternalStore-backed so late registrations re-render live. Surface frozen
 * by the blueprint (§C.6). */

import type { FC, ReactNode } from 'react';
import type { SkinManifest } from '../../shared/index';
import { wsClient } from '../ws';
import { useModeStore, LAST_MODE_KEY, type VibeosMode } from '../stores/modeStore';
import {
  registerComponent,
  type ComponentKey,
  type ComponentProps,
} from './components';
import { registerSkin, listSkins, applySkin, type SkinRegistration } from './skins';
import { registerNativeApp, registerChrome } from './apps';
import { transformMenu, type MenuFactoryCtx, type MenuItem, type MenuId } from './menus';
import { registerIcon } from './icons';
import { extendDict } from './i18nExt';

export type { ComponentKey, ComponentProps } from './components';
export type { SkinRegistration } from './skins';
export type { MenuFactoryCtx, MenuItem, MenuId } from './menus';
export { Overridable, registerComponent } from './components';

export interface VibeosClientApi {
  skins: {
    register(s: SkinRegistration): () => void;
    list(): SkinManifest[];
    apply(id: string): void;
  };
  components: {
    override<K extends ComponentKey>(
      key: K,
      comp: FC<ComponentProps[K]>,
      opts?: { priority?: number },
    ): () => void;
  };
  nativeApps: {
    register(presetId: string, render: (windowId: string) => ReactNode): () => void;
  };
  chromes: {
    register(key: string, comp: FC<{ windowId: string; children: ReactNode }>): () => void;
  };
  menus: {
    transform(menu: MenuId, fn: (items: MenuItem[], ctx: MenuFactoryCtx) => MenuItem[]): () => void;
  };
  icons: {
    register(name: string, comp: FC<{ size?: number }>): () => void;
  };
  i18n: {
    extend(locale: 'zh' | 'en', dict: Record<string, string>): () => void;
  };
  mode: {
    get(): VibeosMode;
    set(m: VibeosMode): void;
    subscribe(fn: () => void): () => void;
  };
}

export const vibeos: VibeosClientApi = {
  skins: {
    register: registerSkin,
    list: listSkins,
    apply: applySkin,
  },
  components: {
    // Defaults sit at priority 0; overrides win at -1 unless told otherwise.
    override: (key, comp, opts) =>
      registerComponent(key, comp, { priority: opts?.priority ?? -1 }),
  },
  nativeApps: { register: registerNativeApp },
  chromes: { register: registerChrome },
  menus: { transform: transformMenu },
  icons: { register: registerIcon },
  i18n: { extend: extendDict },
  mode: {
    get: () => useModeStore.getState().mode,
    // The persisted truth is settings.prefs.classicMode: the host echoes
    // s2c.settings.changed and every tab converges (localStorage only seeds
    // the pre-connect guess).
    set: (m) => {
      try {
        localStorage.setItem(LAST_MODE_KEY, m);
      } catch {
        // private mode
      }
      wsClient.send('c2s.settings.update', {
        partial: { prefs: { classicMode: m === 'classic' } },
      });
    },
    subscribe: (fn) => useModeStore.subscribe(fn),
  },
};
