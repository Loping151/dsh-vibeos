/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/window/Window.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): motion is replaced by CSS transitions, the native-app and
 * chrome tables by registries, frame/titlebar/buttons are overridable and every DOM query stays inside
 * #vibeos-root. Original license: MIT. */

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { AppDescriptor, WindowState } from '../../../shared/index';
import { wsClient } from '../../ws';
import { useWindowStore } from '../../stores/windowStore';
import { useAppStore } from '../../stores/appStore';
import { useWindowDrag } from '../../hooks/useWindowDrag';
import { useT } from '../../lib/i18n';
import { cn, getVibeosRoot } from '../../lib/utils';
import { EASE_OUT, usePresence, useReducedMotion } from '../../lib/anim';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';
import { AppIcon } from '../AppIcon';
import { openContextMenu } from '../contextmenu/ContextMenu';
import { appContentMenu, windowMenu } from '../contextmenu/menus';
import { AiHtmlSurface } from './AiHtmlSurface';
import { AppletSurface } from './AppletSurface';
import { useNativeApp } from './nativeApps';
import { useChrome } from './chromes';
import { Copy, Minus, Save, Square, X } from '../../icons/uiIcons';

interface Resolved {
  win: WindowState | undefined;
  app: AppDescriptor | undefined;
  /** Preset apps with a native React renderer are never AI content. */
  native: boolean;
}

function useResolvedWindow(windowId: string): Resolved {
  const win = useWindowStore((s) => s.windows[windowId]);
  const app = useAppStore((s) => s.apps[win?.appId ?? '']);
  const native = !!useNativeApp(app?.presetId);
  return { win, app, native };
}

export function Window({ windowId }: { windowId: string }): ReactNode {
  return <Overridable component="window-frame" props={{ windowId }} />;
}

function WindowTitlebar({ windowId }: { windowId: string }): ReactNode {
  return <Overridable component="window-titlebar" props={{ windowId }} />;
}

function WindowButtons({ windowId }: { windowId: string }): ReactNode {
  return <Overridable component="window-buttons" props={{ windowId }} />;
}

function DefaultWindowFrame({ windowId }: ComponentProps['window-frame']): ReactNode {
  const { win, app, native } = useResolvedWindow(windowId);
  const html = useWindowStore((s) => s.snapshots[windowId] ?? '');
  const busy = useWindowStore((s) => !!s.busy[windowId]);
  // Applets are stored wrapped so a restart replays them as applets, not markup.
  const applet = /^<vibeos-applet>/i.test(html)
    ? html.replace(/^<vibeos-applet>/i, '').replace(/<\/vibeos-applet>$/i, '')
    : null;
  const dragging = useWindowStore((s) => s.dragging === windowId);
  const { onResize } = useWindowDrag(windowId);
  const t = useT();
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { entered } = usePresence(true);
  // Where to fly when minimizing: the delta from the window centre to its
  // taskbar/Dock item, so it shrinks INTO its icon.
  const [minTarget, setMinTarget] = useState<{ x: number; y: number } | null>(null);

  const chromeKey =
    !native && typeof app?.manifest.chrome === 'string' ? app.manifest.chrome : undefined;
  const Chrome = useChrome(chromeKey);
  const renderNative = useNativeApp(app?.presetId);

  // Minimized windows stay MOUNTED but hidden — unmounting would rebuild the AI
  // surface on restore and lose scroll + DOM state.
  const minimized = win?.state === 'minimized';
  const maximized = win?.state === 'maximized';
  const widget = win?.kind === 'widget';

  useLayoutEffect(() => {
    if (!minimized || reduced) {
      setMinTarget(null);
      return;
    }
    const el = rootRef.current;
    const dock = getVibeosRoot()?.querySelector(`[data-win-id="${windowId}"]`);
    if (!el || !dock) return;
    const wr = el.getBoundingClientRect();
    const dr = dock.getBoundingClientRect();
    setMinTarget({
      x: dr.left + dr.width / 2 - (wr.left + wr.width / 2),
      y: dr.top + dr.height / 2 - (wr.top + wr.height / 2),
    });
  }, [minimized, reduced, windowId]);

  if (!win) return null;

  const focus = () => {
    if (!win.focused) wsClient.send('c2s.window.focus', { windowId });
  };

  const dur = minimized ? 0.3 : 0.16;
  const anim: CSSProperties = minimized
    ? {
        opacity: 0,
        transform: reduced
          ? 'none'
          : `translate(${minTarget?.x ?? 0}px, ${minTarget?.y ?? 240}px) scale(0.15)`,
      }
    : { opacity: entered ? 1 : 0, transform: entered ? 'none' : 'scale(0.97)' };

  const box: CSSProperties = maximized
    ? {
        left: 0,
        top: 0,
        width: '100%',
        // Skins may change the taskbar height; the maximized window follows it.
        height: 'calc(100% - var(--taskbar-h))',
        borderRadius: 0,
      }
    : { left: win.rect.x, top: win.rect.y, width: win.rect.w, height: win.rect.h };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={win.title}
      onPointerDown={widget ? undefined : focus}
      data-focused={win.focused ? 'true' : undefined}
      data-busy={busy ? 'true' : undefined}
      data-maximized={maximized ? 'true' : undefined}
      aria-hidden={minimized || undefined}
      className={cn(
        'vibe-window group sheen',
        widget
          ? 'rounded-2xl border-white/20 bg-card/25 shadow-xl backdrop-blur-2xl'
          : win.focused && 'ring-1 ring-ring/30 win-focused win-glass',
      )}
      style={{
        ...box,
        ...anim,
        zIndex: widget ? 0 : win.z,
        transformOrigin: 'center',
        // Geometry transitions animate maximize/restore but pause during a live
        // drag/resize (they would rubber-band the pointer).
        transition: dragging
          ? 'none'
          : `opacity ${dur}s ${EASE_OUT}, transform ${dur}s ${EASE_OUT}, left 0.2s ${EASE_OUT}, top 0.2s ${EASE_OUT}, width 0.2s ${EASE_OUT}, height 0.2s ${EASE_OUT}, border-radius 0.2s ${EASE_OUT}`,
        pointerEvents: minimized ? 'none' : undefined,
      }}
    >
      {!widget && <WindowTitlebar windowId={windowId} />}

      {/* Widget chrome: a hover drag-handle + close, overlaid on the content. */}
      {widget && <WidgetChrome windowId={windowId} />}

      <div
        className={cn('vibe-window-body', widget && 'bg-transparent')}
        onContextMenu={(e) => openContextMenu(e, appContentMenu({ t, win, native }))}
      >
        {renderNative ? (
          renderNative(windowId)
        ) : applet !== null ? (
          <AppletSurface windowId={windowId} applet={applet} />
        ) : Chrome ? (
          <Chrome windowId={windowId}>
            <AiHtmlSurface windowId={windowId} html={html} />
          </Chrome>
        ) : (
          <AiHtmlSurface windowId={windowId} html={html} />
        )}
      </div>

      {!maximized && !widget && (
        <>
          <div
            onPointerDown={onResize('n')}
            className="absolute inset-x-2 top-0 h-1.5 cursor-ns-resize"
            aria-hidden
          />
          <div
            onPointerDown={onResize('s')}
            className="absolute inset-x-2 bottom-0 h-1.5 cursor-ns-resize"
            aria-hidden
          />
          <div
            onPointerDown={onResize('w')}
            className="absolute inset-y-2 left-0 w-1.5 cursor-ew-resize"
            aria-hidden
          />
          <div
            onPointerDown={onResize('e')}
            className="absolute inset-y-2 right-0 w-1.5 cursor-ew-resize"
            aria-hidden
          />
          <div
            onPointerDown={onResize('nw')}
            className="absolute left-0 top-0 size-3 cursor-nwse-resize"
            aria-hidden
          />
          <div
            onPointerDown={onResize('ne')}
            className="absolute right-0 top-0 size-3 cursor-nesw-resize"
            aria-hidden
          />
          <div
            onPointerDown={onResize('sw')}
            className="absolute bottom-0 left-0 size-3 cursor-nesw-resize"
            aria-hidden
          />
          <div
            onPointerDown={onResize('se')}
            className="absolute bottom-0 right-0 size-3 cursor-nwse-resize"
            aria-hidden
          />
        </>
      )}
    </div>
  );
}

function WidgetChrome({ windowId }: { windowId: string }): ReactNode {
  const { onMoveHandle } = useWindowDrag(windowId);
  const t = useT();
  return (
    <>
      <div
        onPointerDown={onMoveHandle}
        className="absolute inset-x-0 top-0 z-10 h-5 cursor-grab opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      >
        <div className="mx-auto mt-1 h-1 w-8 rounded-full bg-foreground/25" />
      </div>
      <button
        onClick={() => wsClient.send('c2s.window.close', { windowId })}
        title={t('win.close')}
        className="absolute right-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-background/70 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-white group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </>
  );
}

function DefaultWindowTitlebar({ windowId }: ComponentProps['window-titlebar']): ReactNode {
  const { win, app, native } = useResolvedWindow(windowId);
  const { onMoveHandle } = useWindowDrag(windowId);
  const t = useT();
  if (!win) return null;
  const maximized = win.state === 'maximized';
  return (
    <div
      onPointerDown={(e) => {
        // The drag handler does not stop propagation, but the pointerdown that
        // starts a drag must still focus — do it explicitly.
        if (!win.focused) wsClient.send('c2s.window.focus', { windowId });
        if (!maximized) onMoveHandle(e);
      }}
      onDoubleClick={() => wsClient.send('c2s.window.maximize', { windowId })}
      onContextMenu={(e) => openContextMenu(e, windowMenu({ t, win, native }))}
      className={cn('vibe-titlebar', !win.focused && 'bg-muted/50')}
    >
      <AppIcon
        name={app?.icon}
        presetId={app?.presetId}
        label={app?.name ?? win.title}
        className={cn('size-4', !win.focused && 'opacity-50')}
      />
      <span className={cn('vibe-title', win.focused ? 'text-foreground/90' : 'text-muted-foreground')}>
        {win.title}
      </span>
      <WindowButtons windowId={windowId} />
    </div>
  );
}

function DefaultWindowButtons({ windowId }: ComponentProps['window-buttons']): ReactNode {
  const { win, native } = useResolvedWindow(windowId);
  const t = useT();
  if (!win) return null;
  const maximized = win.state === 'maximized';
  return (
    <div className="vibe-winbtns">
      {!native && (
        <TitleButton
          kind="save"
          title={t('win.saveAsApp')}
          onClick={() => wsClient.send('c2s.app.save', { windowId })}
        >
          <Save size={14} />
        </TitleButton>
      )}
      <TitleButton
        kind="min"
        title={t('win.minimize')}
        onClick={() => wsClient.send('c2s.window.minimize', { windowId })}
      >
        <Minus size={14} />
      </TitleButton>
      <TitleButton
        kind="max"
        title={maximized ? t('win.restore') : t('win.maximize')}
        onClick={() => wsClient.send('c2s.window.maximize', { windowId })}
      >
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </TitleButton>
      <TitleButton
        kind="close"
        title={t('win.close')}
        onClick={() => wsClient.send('c2s.window.close', { windowId })}
      >
        <X size={14} />
      </TitleButton>
    </div>
  );
}

function TitleButton({
  children,
  onClick,
  title,
  kind,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  /** Skins repaint the buttons by kind (traffic lights, XP squares). */
  kind: 'save' | 'min' | 'max' | 'close';
}): ReactNode {
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={`vibe-winbtn vibe-winbtn-${kind}`}
    >
      {children}
    </button>
  );
}

registerComponent('window-frame', DefaultWindowFrame);
registerComponent('window-titlebar', DefaultWindowTitlebar);
registerComponent('window-buttons', DefaultWindowButtons);
