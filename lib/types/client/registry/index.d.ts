/** The public client API other plugins reach via require('dsh-vibeos/client').vibeos.
 * Module-level registries exist before any apply runs; the stores behind them are
 * useSyncExternalStore-backed so late registrations re-render live. Surface frozen
 * by the blueprint (§C.6). */
import type { FC, ReactNode } from 'react';
import type { SkinManifest } from '../../shared/index';
import { type VibeosMode } from '../stores/modeStore';
import { type ComponentKey, type ComponentProps } from './components';
import { type SkinRegistration } from './skins';
import { type MenuFactoryCtx, type MenuItem, type MenuId } from './menus';
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
        override<K extends ComponentKey>(key: K, comp: FC<ComponentProps[K]>, opts?: {
            priority?: number;
        }): () => void;
    };
    nativeApps: {
        register(presetId: string, render: (windowId: string) => ReactNode): () => void;
    };
    chromes: {
        register(key: string, comp: FC<{
            windowId: string;
            children: ReactNode;
        }>): () => void;
    };
    menus: {
        transform(menu: MenuId, fn: (items: MenuItem[], ctx: MenuFactoryCtx) => MenuItem[]): () => void;
    };
    icons: {
        register(name: string, comp: FC<{
            size?: number;
        }>): () => void;
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
export declare const vibeos: VibeosClientApi;
