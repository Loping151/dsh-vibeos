/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/window/nativeApps.tsx
 * + chromes.tsx (the two constant tables). Adapted for DeepSeek Harness (dsh-vibeos): both become
 * extensible registries; the built-ins self-register from the component modules. Original license: MIT. */

import type { FC, ReactNode } from 'react';

export type NativeAppRenderer = (windowId: string) => ReactNode;
export type ChromeComponent = FC<{ windowId: string; children: ReactNode }>;

let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version++;
  for (const fn of listeners) fn();
}

const nativeApps = new Map<string, NativeAppRenderer[]>();
const chromes = new Map<string, ChromeComponent[]>();

function push<T>(map: Map<string, T[]>, key: string, value: T): () => void {
  const stack = map.get(key) ?? [];
  stack.push(value);
  map.set(key, stack);
  bump();
  return () => {
    const cur = map.get(key);
    if (!cur) return;
    const i = cur.indexOf(value);
    if (i !== -1) cur.splice(i, 1);
    if (cur.length === 0) map.delete(key);
    bump();
  };
}

function top<T>(map: Map<string, T[]>, key: string | undefined): T | undefined {
  if (key === undefined) return undefined;
  const stack = map.get(key);
  return stack && stack.length > 0 ? stack[stack.length - 1] : undefined;
}

/** Latest registration for a presetId wins (built-ins register first). */
export function registerNativeApp(presetId: string, render: NativeAppRenderer): () => void {
  return push(nativeApps, presetId, render);
}

export function getNativeApp(presetId: string | undefined): NativeAppRenderer | undefined {
  return top(nativeApps, presetId);
}

/** Latest registration for a chrome key wins ('browser' is built in). */
export function registerChrome(key: string, comp: ChromeComponent): () => void {
  return push(chromes, key, comp);
}

export function getChrome(key: string | undefined): ChromeComponent | undefined {
  return top(chromes, key);
}

export function appsRegistryVersion(): number {
  return version;
}

export function subscribeAppsRegistry(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
