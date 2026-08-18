/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/taskbar/Taskbar.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): motion's Reorder becomes the hand-rolled pointer reorder
 * hook, app search goes through the container-scoped ui event, and taskbar/start-button/tray are
 * overridable. Original license: MIT. */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { WindowState } from '../../../shared/index';
import { useWindowStore } from '../../stores/windowStore';
import { useAppStore } from '../../stores/appStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import { useSkin } from '../../registry/skins';
import { useListReorder } from '../../hooks/useListReorder';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';
import { AppIcon } from '../AppIcon';
import { Clock } from './Clock';
import { StartMenu } from '../startmenu/StartMenu';
import { useNotificationCenterStore } from '../notifications/NotificationCenter';
import { openContextMenu } from '../contextmenu/ContextMenu';
import { taskbarItemMenu, taskbarMenu } from '../contextmenu/menus';
import { requestSystemReset } from '../desktop/ResetDialog';
import { Bell, LayoutGrid, Power, RefreshCw } from '../../icons/uiIcons';

function DefaultStartButton({ open, onToggle }: ComponentProps['start-button']): ReactNode {
  const t = useT();
  const skin = useSkin();
  // XP keeps its iconic "start"; the macOS-style docks say "Apps".
  const label = skin === 'xp' ? t('taskbar.start') : t('taskbar.apps');
  return (
    <button
      onClick={onToggle}
      data-open={open ? 'true' : undefined}
      data-popover-trigger="start"
      className="vibe-startbtn"
    >
      <LayoutGrid size={16} />
      {label}
    </button>
  );
}

function DefaultTray(_props: ComponentProps['tray']): ReactNode {
  const t = useT();
  const unread = useNotificationStore((s) => s.notifications.filter((n) => !n.read).length);
  const toggle = useNotificationCenterStore((s) => s.toggle);
  return (
    <div className="vibe-tray-area">
      <button
        onClick={() => requestSystemReset()}
        className="vibe-tray"
        title={t('power.restartHint')}
      >
        <RefreshCw size={15} />
      </button>
      <button
        onClick={() =>
          wsClient.send('c2s.settings.update', { partial: { prefs: { classicMode: true } } })
        }
        className="vibe-tray"
        title={t('power.shutdownHint')}
      >
        <Power size={16} />
      </button>
      <button
        onClick={toggle}
        data-popover-trigger="notifications"
        className="vibe-tray"
        title={t('taskbar.notifications')}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <Clock />
    </div>
  );
}

/** Config-pinned launcher icons (features.pinnedApps, preset/app ids). */
function PinnedApps({ windows }: { windows: readonly WindowState[] }): ReactNode {
  const pinned = useConnectionStore((s) => s.features?.pinnedApps);
  const apps = useAppStore((s) => s.apps);
  const items = useMemo(() => {
    const list = Object.values(apps);
    const running = new Set(windows.map((w) => w.appId));
    return (pinned ?? [])
      .map((id) => list.find((a) => a.presetId === id) ?? apps[id])
      .filter((a): a is NonNullable<typeof a> => !!a && !running.has(a.id));
  }, [pinned, apps, windows]);
  if (!items.length) return null;
  return (
    <>
      <div className="mx-1 h-5 w-px bg-border" />
      <div className="flex items-center gap-0.5">
        {items.map((app) => {
          return (
            <button
              key={app.id}
              onClick={() => wsClient.send('c2s.window.open', { appId: app.id })}
              className="vibe-tray relative"
              title={app.name}
            >
              <AppIcon name={app.icon} presetId={app.presetId} label={app.name} className="size-4" />
            </button>
          );
        })}
      </div>
    </>
  );
}

function DefaultTaskbar(_props: ComponentProps['taskbar']): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useT();
  const windowMap = useWindowStore((s) => s.windows);
  const windows = useMemo(
    () =>
      Object.values(windowMap)
        .filter((w) => w.isOpen && w.kind !== 'widget')
        .sort((a, b) => a.order - b.order),
    [windowMap],
  );
  const apps = useAppStore((s) => s.apps);
  const ids = useMemo(() => windows.map((w) => w.id), [windows]);
  const commit = useCallback((next: string[]) => {
    useWindowStore.getState().reorder(next);
    wsClient.send('c2s.window.reorder', { ids: next });
  }, []);
  const reorder = useListReorder(ids, commit);

  return (
    <>
      <StartMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="vibe-taskbar" onContextMenu={(e) => openContextMenu(e, taskbarMenu({ t }))}>
        <Overridable
          component="start-button"
          props={{ open: menuOpen, onToggle: () => setMenuOpen((v) => !v) }}
        />

        <PinnedApps windows={windows} />

        {/* With nothing running the tray already has its own divider. */}
        {windows.length > 0 && <div className="mx-1 h-5 w-px bg-border" />}

        <div className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {windows.map((w) => {
            const app = apps[w.appId];
            return (
              <button
                key={w.id}
                ref={reorder.refFor(w.id)}
                style={reorder.styleFor(w.id)}
                onPointerDown={reorder.handlePointerDown(w.id)}
                onClickCapture={reorder.onClickCapture}
                onClick={() => wsClient.send('c2s.window.focus', { windowId: w.id })}
                onContextMenu={(e) => openContextMenu(e, taskbarItemMenu({ t, win: w }))}
                data-win-id={w.id}
                data-active={w.focused && w.state !== 'minimized' ? 'true' : undefined}
                className="vibe-taskitem"
              >
                <AppIcon
                  name={app?.icon}
                  presetId={app?.presetId}
                  label={app?.name ?? w.title}
                  className="size-4"
                />
                <span className="vibe-taskitem-label">{w.title}</span>
              </button>
            );
          })}
        </div>

        <Overridable component="tray" props={{}} />
      </div>
    </>
  );
}

registerComponent('start-button', DefaultStartButton);
registerComponent('tray', DefaultTray);
registerComponent('taskbar', DefaultTaskbar);

export function Taskbar(): ReactNode {
  return <Overridable component="taskbar" props={{}} />;
}
