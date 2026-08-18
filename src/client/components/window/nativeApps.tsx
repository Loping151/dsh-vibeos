/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/window/nativeApps.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): the constant table becomes the native-app registry, which
 * companion plugins extend. Original license: MIT. */

import { useSyncExternalStore } from 'react';
import {
  appsRegistryVersion,
  getNativeApp,
  registerNativeApp,
  subscribeAppsRegistry,
  type NativeAppRenderer,
} from '../../registry/apps';
import { SettingsApp } from '../settings/SettingsApp';
import { ActivityMonitorApp } from '../activity/ActivityMonitorApp';
import { AppStoreApp } from '../store/AppStoreApp';
import { RecycleBinApp } from '../recyclebin/RecycleBinApp';
import { WelcomeApp } from '../welcome/WelcomeApp';

// Apps rendered natively (real React), not AI-generated — they drive real system
// state. browser / command-line / file-manager are presets but NOT native.
registerNativeApp('settings', () => <SettingsApp />);
registerNativeApp('activity-monitor', () => <ActivityMonitorApp />);
registerNativeApp('app-store', () => <AppStoreApp />);
registerNativeApp('recycle-bin', () => <RecycleBinApp />);
registerNativeApp('welcome', (windowId) => <WelcomeApp windowId={windowId} />);

/** Native renderer for a preset id, live across registrations. */
export function useNativeApp(presetId: string | undefined): NativeAppRenderer | undefined {
  useSyncExternalStore(subscribeAppsRegistry, appsRegistryVersion, appsRegistryVersion);
  return getNativeApp(presetId);
}
