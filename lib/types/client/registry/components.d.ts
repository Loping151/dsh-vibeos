/** Keyed component override store: desktop chrome renders through <Overridable>,
 * which resolves the lowest-priority registration (slot shadowing semantics).
 * Defaults self-register at priority 0 from the component modules; overrides
 * pick a lower priority and receive `Default` to decorate instead of replace. */
import { type FC, type ReactNode } from 'react';
import type { Notification, VfsNode } from '../../shared/index';
export interface ComponentBasePropsMap {
    'boot-screen': Record<never, never>;
    wallpaper: Record<never, never>;
    'desktop-icon': {
        node: VfsNode;
    };
    taskbar: Record<never, never>;
    'start-button': {
        open: boolean;
        onToggle: () => void;
    };
    'start-menu': {
        open: boolean;
        onClose: () => void;
    };
    clock: Record<never, never>;
    tray: Record<never, never>;
    'window-frame': {
        windowId: string;
    };
    'window-titlebar': {
        windowId: string;
    };
    'window-buttons': {
        windowId: string;
    };
    'notification-toast': {
        notification: Notification;
        onDismiss: () => void;
    };
    'notification-center': {
        open: boolean;
        onClose: () => void;
    };
    'context-menu': Record<never, never>;
    spotlight: {
        open: boolean;
        onClose: () => void;
    };
}
export type ComponentKey = keyof ComponentBasePropsMap;
/** Registered components additionally receive the next entry down the chain. */
export type ComponentProps = {
    [K in ComponentKey]: ComponentBasePropsMap[K] & {
        Default: FC<ComponentBasePropsMap[K]>;
    };
};
/** Lowest priority renders; ties break toward the earlier registration. */
export declare function registerComponent<K extends ComponentKey>(key: K, comp: FC<ComponentProps[K]>, opts?: {
    priority?: number;
}): () => void;
/** Render seam every overridable chrome piece goes through. */
export declare function Overridable<K extends ComponentKey>(props: {
    component: K;
    props: ComponentBasePropsMap[K];
}): ReactNode;
