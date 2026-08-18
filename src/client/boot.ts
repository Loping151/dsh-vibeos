/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/hooks/useBoot.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): plain function instead of a hook (registered from
 * apply, unwired on dispose); provider frames replaced by s2c.models.info; boot state also
 * hydrates the skin registry, effective models, features and the desktop/classic mode.
 * Original license: MIT. */

import { wsClient } from './ws';
import { useConnectionStore } from './stores/connectionStore';
import { useWindowStore } from './stores/windowStore';
import { useAppStore } from './stores/appStore';
import { useVfsStore } from './stores/vfsStore';
import { useNotificationStore } from './stores/notificationStore';
import { useSettingsStore } from './stores/settingsStore';
import { useActivityStore } from './stores/activityStore';
import { useChromeStore } from './stores/chromeStore';
import { useModeStore, type VibeosMode } from './stores/modeStore';
import { registerBootSkin } from './registry/skins';
import { browserLocale, translate } from './lib/i18n';
import { applyRegions } from './lib/patch';
import { ulid, type Settings } from '../shared/index';
import type { BootFeatures } from './stores/connectionStore';

function syncMode(settings: Settings, features?: BootFeatures): void {
  const classic = settings.prefs?.classicMode;
  let mode: VibeosMode;
  if (classic !== undefined) mode = classic ? 'classic' : 'desktop';
  else if (features) mode = features.classicDefault ? 'classic' : 'desktop';
  else return;
  useModeStore.getState().set(mode);
}

/** The ONLY ws→store wiring. Returns an unsubscribe-all disposer. */
export function registerBootWiring(): () => void {
  const conn = useConnectionStore.getState();
  const win = useWindowStore.getState();
  const apps = useAppStore.getState();
  const vfs = useVfsStore.getState();
  const notif = useNotificationStore.getState();
  const settings = useSettingsStore.getState();

  const offs: Array<() => void> = [];

  offs.push(
    wsClient.onStatus((connected) => {
      conn.setConnected(connected);
      if (connected) {
        conn.setBootPhase('restoring');
        wsClient.send('c2s.boot.hello', {});
      } else {
        conn.setBootPhase('connecting');
      }
    }),
  );

  offs.push(
    wsClient.on('s2c.boot.state', (p) => {
      conn.setBootInfo({
        bootCount: p.bootCount,
        version: p.version,
        effective: p.effective,
        features: p.features,
      });
      for (const skin of p.skins) registerBootSkin(skin);
      settings.set(p.settings);
      syncMode(p.settings, p.features);
      // First boot: no language chosen yet → follow the browser and persist it
      // so AI generation (host-side) matches the UI language too.
      if (!p.settings.locale) {
        wsClient.send('c2s.settings.update', { partial: { locale: browserLocale() } });
      }
      apps.setAll(p.apps);
      vfs.setAll([...p.desktopNodes, ...p.recycleBinNodes]);
      win.setAll(p.windows, p.snapshots);
      notif.setAll(p.notifications);
      useActivityStore.getState().setAll(p.agentRuns);
    }),
  );

  offs.push(wsClient.on('s2c.boot.ready', () => conn.setBootPhase('ready')));

  // System reset: drop every store except connection/settings (both rehydrate
  // from the fresh boot.state) and re-hello for a clean first-boot payload.
  offs.push(
    wsClient.on('s2c.system.reset', () => {
      conn.setBootPhase('restoring');
      useWindowStore.setState({ windows: {}, snapshots: {}, busy: {} });
      useAppStore.setState({ apps: {} });
      useVfsStore.setState({ nodes: {} });
      useNotificationStore.setState({ notifications: [], toasts: [] });
      useActivityStore.setState({ runs: [], hasMore: false, loading: false });
      useChromeStore.setState({ states: {} });
      wsClient.send('c2s.boot.hello', {});
    }),
  );

  offs.push(
    wsClient.on('s2c.agent.run', (p) => useActivityStore.getState().upsert(p.run)),
    wsClient.on('s2c.activity.page', (p) =>
      useActivityStore.getState().appendPage(p.runs, p.hasMore),
    ),
  );

  offs.push(
    wsClient.on('s2c.models.info', (p) =>
      useConnectionStore.getState().setModelsInfo({ effective: p.effective, catalog: p.catalog }),
    ),
  );

  // Surface backend errors as an error toast, localized by code (+ raw detail).
  offs.push(
    wsClient.on('s2c.error', (p) => {
      const locale = useSettingsStore.getState().settings?.locale ?? browserLocale();
      const byCode = translate(locale, `error.${p.code}`);
      const title = byCode === `error.${p.code}` ? translate(locale, 'error.generic') : byCode;
      useNotificationStore.getState().push({
        id: ulid(),
        kind: 'error',
        title,
        body: p.detail,
        source: 'system',
        read: false,
        createdAt: Date.now(),
      });
    }),
  );

  offs.push(
    wsClient.on('s2c.ui.patch', (p) => {
      const store = useWindowStore.getState();
      if (p.mode === 'full' && p.applet !== undefined) {
        store.setSnapshot(p.windowId, `<vibeos-applet>${p.applet}</vibeos-applet>`);
      } else if (p.mode === 'full' && p.html !== undefined) {
        store.setSnapshot(p.windowId, p.html);
      } else if (p.mode === 'regions' && p.regions) {
        const current = store.snapshots[p.windowId] ?? '';
        store.setSnapshot(p.windowId, applyRegions(current, p.regions));
      }
      if (p.done) store.setBusy(p.windowId, false);
    }),
  );

  offs.push(
    wsClient.on('s2c.ui.busy', (p) => useWindowStore.getState().setBusy(p.windowId, p.busy)),
  );

  offs.push(wsClient.on('s2c.window.opened', (p) => win.upsert(p.window)));
  offs.push(
    wsClient.on('s2c.window.closed', (p) => {
      win.remove(p.windowId);
      useChromeStore.getState().clear(p.windowId);
    }),
  );
  offs.push(wsClient.on('s2c.window.focused', (p) => win.focus(p.windowId)));
  offs.push(wsClient.on('s2c.window.moved', (p) => win.upsert(p.window)));
  offs.push(wsClient.on('s2c.window.stateChanged', (p) => win.upsert(p.window)));
  offs.push(wsClient.on('s2c.window.reordered', (p) => win.reorder(p.ids)));
  offs.push(
    wsClient.on('s2c.chrome.set', (p) => useChromeStore.getState().set(p.windowId, p.patch)),
  );

  offs.push(
    wsClient.on('s2c.syscall.notify', (p) => useNotificationStore.getState().push(p.notification)),
  );
  offs.push(
    wsClient.on('s2c.syscall.appInstalled', (p) => {
      useAppStore.getState().upsert(p.app);
      if (p.shortcut) useVfsStore.getState().upsert(p.shortcut);
    }),
  );
  offs.push(wsClient.on('s2c.syscall.fileCreated', (p) => useVfsStore.getState().upsert(p.node)));
  offs.push(
    wsClient.on('s2c.vfs.changed', (p) => useVfsStore.getState().upsert(p.node)),
    wsClient.on('s2c.vfs.removed', (p) => useVfsStore.getState().remove(p.ids)),
    wsClient.on('s2c.session.exported', (p) => {
      const blob = new Blob([p.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.name}.vibeos-session.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }),
    wsClient.on('s2c.app.exported', (p) => {
      const blob = new Blob([p.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${p.name}.vibeapp`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }),
    wsClient.on('s2c.app.removed', (p) => {
      useAppStore.getState().remove(p.appId);
      useVfsStore.getState().remove(p.nodeIds);
    }),
  );
  offs.push(
    wsClient.on('s2c.settings.changed', (p) => {
      useSettingsStore.getState().set(p.settings);
      syncMode(p.settings);
    }),
  );
  offs.push(
    wsClient.on('s2c.notification.read', (p) => useNotificationStore.getState().markRead(p.id)),
  );

  return () => {
    for (const off of offs) off();
  };
}
