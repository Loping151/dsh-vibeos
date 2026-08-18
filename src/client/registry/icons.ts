/** Icon registry: extends the built-in lucide-vocab table with custom glyphs.
 * Custom registrations win over the built-ins; AppIcon consults resolveIcon. */

import type { FC } from 'react';
import { NAME_ICONS } from '../icons/appIcons';
import type { IconProps } from '../icons/uiIcons';

export type IconComponent = FC<IconProps>;

const custom = new Map<string, IconComponent[]>();
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version++;
  for (const fn of listeners) fn();
}

export function registerIcon(name: string, comp: IconComponent): () => void {
  const key = name.toLowerCase();
  const stack = custom.get(key) ?? [];
  stack.push(comp);
  custom.set(key, stack);
  bump();
  return () => {
    const cur = custom.get(key);
    if (!cur) return;
    const i = cur.indexOf(comp);
    if (i !== -1) cur.splice(i, 1);
    if (cur.length === 0) custom.delete(key);
    bump();
  };
}

export function resolveIcon(name: string): IconComponent | undefined {
  const key = name.toLowerCase();
  const stack = custom.get(key);
  if (stack && stack.length > 0) return stack[stack.length - 1];
  return NAME_ICONS[key];
}

export function iconsVersion(): number {
  return version;
}

export function subscribeIcons(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
