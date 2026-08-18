/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/notifications/NotificationCenter.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): motion becomes a CSS presence transition, the open state
 * lives in a module store (the tray toggles it, the desktop renders it) and outside-click is scoped to
 * #vibeos-root. Original license: MIT. */

import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { useNotificationStore } from '../../stores/notificationStore';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import { cn, getVibeosRoot } from '../../lib/utils';
import { popoverStyle, usePresence, useReducedMotion } from '../../lib/anim';
import { useAnchoredPopover } from '../../hooks/useAnchoredPopover';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';
import { CheckCheck } from '../../icons/uiIcons';

const TRIGGER = '[data-popover-trigger="notifications"]';

interface CenterState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

/** Shared between the taskbar tray (toggle) and the desktop (render). */
export const useNotificationCenterStore = create<CenterState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));

function DefaultNotificationCenter({
  open,
  onClose,
}: ComponentProps['notification-center']): ReactNode {
  const notifications = useNotificationStore((s) => s.notifications);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  const reduced = useReducedMotion();
  const { mounted, entered } = usePresence(open);
  const anchor = useAnchoredPopover(open, TRIGGER, 'right', 384);

  useEffect(() => {
    if (!open) return;
    const root = getVibeosRoot();
    const onDown = (e: Event) => {
      // Ignore the trigger so clicking it toggles closed (not close-then-reopen).
      if ((e.target as HTMLElement)?.closest?.(TRIGGER)) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    root?.addEventListener('pointerdown', onDown);
    return () => root?.removeEventListener('pointerdown', onDown);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      ref={ref}
      style={{ ...anchor, ...popoverStyle(entered, reduced), transformOrigin: 'bottom right' }}
      className="vibe-notif z-[9999] flex max-h-[70vh] w-96 flex-col p-0"
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-medium">{t('notif.title')}</span>
        <button
          onClick={() => wsClient.send('c2s.notification.read', { id: 'all' })}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <CheckCheck size={14} /> {t('notif.markAllRead')}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {notifications.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{t('notif.empty')}</div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                wsClient.send('c2s.notification.click', { id: n.id });
                onClose();
              }}
              className={cn(
                'flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent',
                !n.read && 'bg-accent/40',
              )}
            >
              <div className="flex w-full items-center gap-2">
                {!n.read && <span className="size-1.5 rounded-full bg-brand" />}
                <span className="flex-1 truncate text-sm font-medium">{n.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(n.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {n.body && <span className="mt-0.5 text-xs text-muted-foreground">{n.body}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

registerComponent('notification-center', DefaultNotificationCenter);

export function NotificationCenter(props: { open: boolean; onClose: () => void }): ReactNode {
  return <Overridable component="notification-center" props={props} />;
}
