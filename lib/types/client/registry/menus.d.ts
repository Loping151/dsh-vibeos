import type { ReactNode } from 'react';
export type MenuItem = {
    type: 'item';
    label: string;
    icon?: ReactNode;
    shortcut?: string;
    checked?: boolean;
    disabled?: boolean;
    danger?: boolean;
    onSelect: () => void;
} | {
    type: 'submenu';
    label: string;
    icon?: ReactNode;
    items: MenuItem[];
} | {
    type: 'separator';
};
export type MenuId = 'desktop' | 'window' | 'taskbarItem' | 'desktopItem' | 'taskbar' | 'appContent';
/** Context the menu factory built the items with (what was right-clicked). */
export interface MenuFactoryCtx {
    windowId?: string;
    appId?: string;
    nodeId?: string;
    [k: string]: unknown;
}
export type MenuTransformer = (items: MenuItem[], ctx: MenuFactoryCtx) => MenuItem[];
export declare function transformMenu(menu: MenuId, fn: MenuTransformer): () => void;
/** Pipe factory output through the registered transformers, registration order. */
export declare function applyMenuTransforms(menu: MenuId, items: MenuItem[], ctx: MenuFactoryCtx): MenuItem[];
