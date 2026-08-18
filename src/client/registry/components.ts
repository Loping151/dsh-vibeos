/** Keyed component override store: desktop chrome renders through <Overridable>,
 * which resolves the lowest-priority registration (slot shadowing semantics).
 * Defaults self-register at priority 0 from the component modules; overrides
 * pick a lower priority and receive `Default` to decorate instead of replace. */

import {
  createElement,
  useSyncExternalStore,
  type FC,
  type ReactNode,
} from 'react';
import type { Notification, VfsNode } from '../../shared/index';

export interface ComponentBasePropsMap {
  'boot-screen': Record<never, never>;
  wallpaper: Record<never, never>;
  'desktop-icon': { node: VfsNode };
  taskbar: Record<never, never>;
  'start-button': { open: boolean; onToggle: () => void };
  'start-menu': { open: boolean; onClose: () => void };
  clock: Record<never, never>;
  tray: Record<never, never>;
  'window-frame': { windowId: string };
  'window-titlebar': { windowId: string };
  'window-buttons': { windowId: string };
  'notification-toast': { notification: Notification; onDismiss: () => void };
  'notification-center': { open: boolean; onClose: () => void };
  'context-menu': Record<never, never>;
  spotlight: { open: boolean; onClose: () => void };
}

export type ComponentKey = keyof ComponentBasePropsMap;

/** Registered components additionally receive the next entry down the chain. */
export type ComponentProps = {
  [K in ComponentKey]: ComponentBasePropsMap[K] & {
    Default: FC<ComponentBasePropsMap[K]>;
  };
};

interface Entry {
  comp: FC<never>;
  priority: number;
  seq: number;
}

const entries = new Map<ComponentKey, Entry[]>();
let seqCounter = 0;
let version = 0;
const listeners = new Set<() => void>();
const boundCache = new Map<ComponentKey, FC<never>[]>();

function bump(): void {
  version++;
  boundCache.clear();
  for (const fn of listeners) fn();
}

/** Lowest priority renders; ties break toward the earlier registration. */
export function registerComponent<K extends ComponentKey>(
  key: K,
  comp: FC<ComponentProps[K]>,
  opts?: { priority?: number },
): () => void {
  const entry: Entry = { comp: comp as FC<never>, priority: opts?.priority ?? 0, seq: seqCounter++ };
  const list = entries.get(key) ?? [];
  list.push(entry);
  list.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
  entries.set(key, list);
  bump();
  return () => {
    const cur = entries.get(key);
    if (!cur) return;
    const i = cur.indexOf(entry);
    if (i !== -1) {
      cur.splice(i, 1);
      bump();
    }
  };
}

const NullDefault: FC<never> = () => null;

/* Bound wrappers are cached per (key, index) and invalidated only on registry
 * changes: a fresh function identity every render would make React remount the
 * whole subtree (window flash, AI-surface rebuild) on any parent re-render. */
function chainAt(key: ComponentKey, index: number): FC<never> {
  const list = entries.get(key);
  const entry = list?.[index];
  if (!entry) return NullDefault;
  let cache = boundCache.get(key);
  if (!cache) {
    cache = [];
    boundCache.set(key, cache);
  }
  const hit = cache[index];
  if (hit) return hit;
  const Comp = entry.comp as FC<Record<string, unknown>>;
  const Bound: FC<Record<string, unknown>> = (props) =>
    createElement(Comp, { ...props, Default: chainAt(key, index + 1) });
  cache[index] = Bound as FC<never>;
  return cache[index];
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getVersion(): number {
  return version;
}

/** Render seam every overridable chrome piece goes through. */
export function Overridable<K extends ComponentKey>(props: {
  component: K;
  props: ComponentBasePropsMap[K];
}): ReactNode {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const Active = chainAt(props.component, 0) as FC<Record<string, unknown>>;
  return createElement(Active, props.props as Record<string, unknown>);
}
