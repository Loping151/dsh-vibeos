/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/window/chromes.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): the constant table becomes the chrome registry, which
 * companion plugins extend. Original license: MIT. */

import { useSyncExternalStore } from 'react';
import {
  appsRegistryVersion,
  getChrome,
  registerChrome,
  subscribeAppsRegistry,
  type ChromeComponent,
} from '../../registry/apps';
import { BrowserChrome } from './BrowserChrome';
import { TerminalChrome } from './TerminalChrome';

registerChrome('browser', BrowserChrome);
registerChrome('terminal', TerminalChrome);

/** Native chrome shell for an AppManifest.chrome key, live across registrations. */
export function useChrome(key: string | undefined): ChromeComponent | undefined {
  useSyncExternalStore(subscribeAppsRegistry, appsRegistryVersion, appsRegistryVersion);
  return getChrome(key);
}
