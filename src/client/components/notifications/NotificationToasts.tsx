/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/notifications/NotificationToasts.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): motion becomes a CSS enter/exit transition (the toast
 * schedules its own removal) and each toast renders through the override registry. Original license: MIT. */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { NotificationKind } from '../../../shared/index';
import { useNotificationStore } from '../../stores/notificationStore';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import { EASE_OUT, useReducedMotion } from '../../lib/anim';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from '../../icons/uiIcons';

const DWELL_MS = 5200;
const EXIT_MS = 200;

const ICON: Record<NotificationKind, ReactNode> = {
  info: <Info size={16} className="text-muted-foreground" />,
  success: <CheckCircle2 size={16} className="text-run" />,
  warning: <AlertTriangle size={16} className="text-warn" />,
  error: <XCircle size={16} className="text-destructive" />,
};

function DefaultToast({ notification, onDismiss }: ComponentProps['notification-toast']): ReactNode {
  const reduced = useReducedMotion();
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  // Held in a ref so a parent re-render cannot restart the exit timer.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  // Mount at the offset, enter on the next frame, leave after the dwell.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    const dwell = setTimeout(() => setExiting(true), DWELL_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(dwell);
    };
  }, []);

  // The store drops the toast only after the exit transition has played.
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => dismiss.current(), EXIT_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  const t = useT();
  const visible = entered && !exiting;
  const offset = reduced ? 0 : 16;
  const style: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'none' : `translateX(${offset}px)`,
    transition: `opacity ${EXIT_MS}ms ${EASE_OUT}, transform ${EXIT_MS}ms ${EASE_OUT}`,
  };

  return (
    <div
      className="vibe-notif pointer-events-auto relative"
      style={style}
      onClick={() => {
        wsClient.send('c2s.notification.click', { id: notification.id });
        setExiting(true);
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          wsClient.send('c2s.notification.read', { id: notification.id });
          setExiting(true);
        }}
        title={t('notif.dismiss')}
        className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X size={12} />
      </button>
      <div className="flex items-start gap-2.5 pr-4">
        <span className="mt-0.5">{ICON[notification.kind]}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{notification.title}</div>
          {notification.body && (
            <div className="mt-0.5 text-xs text-muted-foreground">{notification.body}</div>
          )}
          {notification.action && (
            <div className="mt-1.5 text-xs font-medium text-brand">{notification.action.label}</div>
          )}
        </div>
      </div>
    </div>
  );
}

registerComponent('notification-toast', DefaultToast);

export function NotificationToasts(): ReactNode {
  const toasts = useNotificationStore((s) => s.toasts);
  const dismiss = useNotificationStore((s) => s.dismissToast);
  const onDismiss = useCallback((id: string) => () => dismiss(id), [dismiss]);
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[9999] flex flex-col gap-2">
      {toasts.slice(-4).map((n) => (
        <Overridable
          key={n.id}
          component="notification-toast"
          props={{ notification: n, onDismiss: onDismiss(n.id) }}
        />
      ))}
    </div>
  );
}
