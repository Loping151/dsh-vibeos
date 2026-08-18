/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/desktop/DesktopIcon.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): Phosphor glyphs come from the icon registry and the icon
 * renders through the component override registry. Original license: MIT. */

import { useRef, type ReactNode } from 'react';
import type { VfsNode } from '../../../shared/index';
import { useAppStore } from '../../stores/appStore';
import { useVfsStore } from '../../stores/vfsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { snapToGrid } from '../../lib/desktopGrid';
import { resolveIcon } from '../../registry/icons';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';
import { AppIcon } from '../AppIcon';
import { openContextMenu } from '../contextmenu/ContextMenu';
import { desktopItemMenu } from '../contextmenu/menus';

/** Pointer travel that turns a click into a drag. */
const DRAG_THRESHOLD = 4;

function DefaultDesktopIcon({ node }: ComponentProps['desktop-icon']): ReactNode {
  const apps = useAppStore((s) => s.apps);
  const hasWallpaper = useSettingsStore((s) => !!s.settings?.prefs.wallpaper);
  const t = useT();
  const dragging = useRef(false);
  const moved = useRef(false);

  const open = () => {
    if (moved.current) return;
    wsClient.send('c2s.vfs.open', { nodeId: node.id });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const start = { px: e.clientX, py: e.clientY, x: node.x ?? 24, y: node.y ?? 24 };
    dragging.current = true;
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) moved.current = true;
      useVfsStore.getState().upsert({
        ...node,
        x: Math.max(8, start.x + dx),
        y: Math.max(8, start.y + dy),
      });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved.current) {
        const cur = useVfsStore.getState().nodes[node.id];
        if (cur) {
          const { x, y } = snapToGrid(cur.x ?? 24, cur.y ?? 24);
          useVfsStore.getState().upsert({ ...cur, x, y });
          wsClient.send('c2s.vfs.move', { nodeId: node.id, location: 'desktop', x, y });
        }
        setTimeout(() => (moved.current = false), 0);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const shortcutApp = apps[node.targetAppId ?? ''];
  const Folder = resolveIcon('folder');
  const File = resolveIcon('file-text');
  const icon =
    node.type === 'shortcut' ? (
      <AppIcon
        name={shortcutApp?.icon ?? (node.meta.icon as string | undefined)}
        presetId={shortcutApp?.presetId}
        label={shortcutApp?.name ?? node.name}
        className="size-7"
      />
    ) : node.type === 'folder' ? (
      Folder && <Folder className="size-7" />
    ) : (
      File && <File className="size-7" />
    );

  return (
    <button
      onPointerDown={onPointerDown}
      onClick={(e) => (e.currentTarget as HTMLElement).focus()}
      onDoubleClick={open}
      onContextMenu={(e) => openContextMenu(e, desktopItemMenu({ t, node }))}
      title={t('desktop.openHint')}
      className="absolute flex w-20 touch-none flex-col items-center gap-1 rounded-lg p-2 text-center transition-colors hover:bg-foreground/5 focus:bg-foreground/15 focus:ring-1 focus:ring-ring/40 focus-visible:bg-foreground/10"
      style={{ left: node.x ?? 24, top: node.y ?? 24 }}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center leading-none',
          hasWallpaper && 'desktop-glyph-on-wallpaper',
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          'line-clamp-2 text-[11px]',
          hasWallpaper ? 'desktop-icon-on-wallpaper' : 'text-foreground/90 drop-shadow',
        )}
      >
        {node.name}
      </span>
    </button>
  );
}

registerComponent('desktop-icon', DefaultDesktopIcon);

export function DesktopIcon(props: { node: VfsNode }): ReactNode {
  return <Overridable component="desktop-icon" props={props} />;
}
