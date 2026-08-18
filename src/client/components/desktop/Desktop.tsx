/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/desktop/Desktop.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): the wallpaper layer is overridable, spotlight state lives
 * in its own store, the open-spotlight event is container-scoped and the keyboard shortcut is gated on
 * desktop mode. Original license: MIT. */

import { useEffect, useMemo, type ReactNode } from 'react';
import { useVfsStore } from '../../stores/vfsStore';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModeStore } from '../../stores/modeStore';
import { useWindowStore } from '../../stores/windowStore';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import { autoArrange as gridArrange } from '../../lib/desktopGrid';
import { onOpenSpotlight } from '../../lib/uiEvents';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';
import { DesktopIcon } from './DesktopIcon';
import { WindowManager } from '../window/WindowManager';
import { Taskbar } from '../taskbar/Taskbar';
import { NotificationToasts } from '../notifications/NotificationToasts';
import {
  NotificationCenter,
  useNotificationCenterStore,
} from '../notifications/NotificationCenter';
import { Spotlight, useSpotlightStore } from '../spotlight/Spotlight';
import { ContextMenuRoot, openContextMenu } from '../contextmenu/ContextMenu';
import { desktopMenu } from '../contextmenu/menus';
import { ResetDialog } from './ResetDialog';

function DefaultWallpaper(_props: ComponentProps['wallpaper']): ReactNode {
  const wallpaper = useSettingsStore((s) => s.settings?.prefs.wallpaper);
  return (
    <>
      {/* Default textured backdrop: token-tinted so every skin keeps its own
          palette — corner glows, faint ripple rings, dot grid, diagonal weave,
          bottom vignette. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: 'var(--desktop)',
          backgroundImage: [
            'radial-gradient(120% 120% at 82% -5%, color-mix(in oklab, var(--brand) 13%, transparent), transparent 60%)',
            'radial-gradient(90% 90% at 6% 104%, color-mix(in oklab, var(--primary) 9%, transparent), transparent 55%)',
            'repeating-radial-gradient(circle at 78% 18%, color-mix(in oklab, var(--foreground) 2.2%, transparent) 0 1px, transparent 1px 96px)',
            'radial-gradient(color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1.2px)',
            'repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 2.2%, transparent) 0 1px, transparent 1px 8px)',
            'radial-gradient(140% 100% at 50% 122%, color-mix(in oklab, #000 20%, transparent), transparent 55%)',
          ].join(', '),
          backgroundSize: 'auto, auto, auto, 22px 22px, auto, auto',
        }}
      />
      {wallpaper && (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${wallpaper}")` }}
          />
          {/* Scrim keeps desktop icon labels legible over any image. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/25" />
        </>
      )}
    </>
  );
}

registerComponent('wallpaper', DefaultWallpaper);

export function Desktop(): ReactNode {
  const nodeMap = useVfsStore((s) => s.nodes);
  const nodes = useMemo(
    () => Object.values(nodeMap).filter((n) => n.location === 'desktop'),
    [nodeMap],
  );
  const t = useT();
  const appMap = useAppStore((s) => s.apps);
  const skin = useSettingsStore((s) => s.settings?.skin ?? 'devdock');
  const theme = useSettingsStore((s) => s.settings?.theme ?? 'dark');
  const notifOpen = useNotificationCenterStore((s) => s.open);
  const closeNotif = useNotificationCenterStore((s) => s.close);
  const spotlightOpen = useSpotlightStore((s) => s.open);
  const closeSpotlight = useSpotlightStore((s) => s.close);

  // Cmd/Ctrl + Space or K toggles app search, like Spotlight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useModeStore.getState().mode !== 'desktop') return;
      if ((e.metaKey || e.ctrlKey) && (e.code === 'Space' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        useSpotlightStore.getState().toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ctrl/Cmd+Z undoes (Shift redoes) the focused window's last content change.
  // Never while typing — text fields keep their native editing shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useModeStore.getState().mode !== 'desktop') return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const focused = Object.values(useWindowStore.getState().windows).find((w) => w.focused);
      if (!focused) return;
      e.preventDefault();
      wsClient.send(e.shiftKey ? 'c2s.window.redo' : 'c2s.window.undo', { windowId: focused.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Native app windows (e.g. Welcome) ask the shell to open Spotlight through a
  // container-scoped event instead of a callback threaded through every layer.
  useEffect(
    () => onOpenSpotlight((detail) => useSpotlightStore.getState().openWith(detail.query ?? '')),
    [],
  );

  const autoArrange = () => {
    const desktopNodes = Object.values(useVfsStore.getState().nodes).filter(
      (n) => n.location === 'desktop',
    );
    for (const { nodeId, x, y } of gridArrange(desktopNodes, window.innerHeight)) {
      const node = useVfsStore.getState().nodes[nodeId];
      if (!node) continue;
      useVfsStore.getState().upsert({ ...node, x, y });
      wsClient.send('c2s.vfs.move', { nodeId, location: 'desktop', x, y });
    }
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-desktop"
      onContextMenu={(e) =>
        openContextMenu(
          e,
          desktopMenu({
            t,
            apps: Object.values(appMap).filter((a) => a.id !== '__transient__'),
            skin,
            theme,
            onAppSearch: () => useSpotlightStore.getState().openWith(''),
            onAutoArrange: autoArrange,
          }),
        )
      }
    >
      <Overridable component="wallpaper" props={{}} />

      <div className="absolute inset-0 bottom-11">
        {nodes.map((n) => (
          <DesktopIcon key={n.id} node={n} />
        ))}
      </div>

      <WindowManager />

      <NotificationToasts />
      <NotificationCenter open={notifOpen} onClose={closeNotif} />

      <Spotlight open={spotlightOpen} onClose={closeSpotlight} />

      <ResetDialog />

      <Taskbar />

      <ContextMenuRoot />
    </div>
  );
}
