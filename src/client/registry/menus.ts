/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/contextmenu/ContextMenu.tsx
 * (MenuItem shape). Adapted for DeepSeek Harness (dsh-vibeos): menu content flows through a
 * transformer registry so companion plugins can add/remove items. Original license: MIT. */

import type { ReactNode } from 'react';

export type MenuItem =
  | {
      type: 'item';
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    }
  | { type: 'submenu'; label: string; icon?: ReactNode; items: MenuItem[] }
  | { type: 'separator' };

export type MenuId =
  | 'desktop'
  | 'window'
  | 'taskbarItem'
  | 'desktopItem'
  | 'taskbar'
  | 'appContent';

/** Context the menu factory built the items with (what was right-clicked). */
export interface MenuFactoryCtx {
  windowId?: string;
  appId?: string;
  nodeId?: string;
  [k: string]: unknown;
}

export type MenuTransformer = (items: MenuItem[], ctx: MenuFactoryCtx) => MenuItem[];

const transformers = new Map<MenuId, MenuTransformer[]>();

export function transformMenu(menu: MenuId, fn: MenuTransformer): () => void {
  const list = transformers.get(menu) ?? [];
  list.push(fn);
  transformers.set(menu, list);
  return () => {
    const cur = transformers.get(menu);
    if (!cur) return;
    const i = cur.indexOf(fn);
    if (i !== -1) cur.splice(i, 1);
  };
}

/** Pipe factory output through the registered transformers, registration order. */
export function applyMenuTransforms(
  menu: MenuId,
  items: MenuItem[],
  ctx: MenuFactoryCtx,
): MenuItem[] {
  let out = items;
  for (const fn of transformers.get(menu) ?? []) {
    try {
      out = fn(out, ctx);
    } catch (err) {
      console.warn('[vibeos] menu transformer failed', menu, err);
    }
  }
  return out;
}
