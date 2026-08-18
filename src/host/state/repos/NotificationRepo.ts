/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/NotificationRepo.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): the notifications table becomes one capped, newest-first list in
 * the vibeos_activity global. Original license: MIT. */

import type {
  Notification,
  NotificationAction,
  NotificationKind,
  NotificationSource,
} from '../../../shared';
import { stripEmoji, ulid } from '../../../shared';
import type { ActivityHandle } from '../domains';

/** How many notifications survive; the client only ever shows the newest 50. */
const CAP = 100;

export class NotificationRepo {
  constructor(private readonly activity: ActivityHandle) {}

  /** Newest first. */
  listRecent(limit = 50): Notification[] {
    return this.activity.domain.global.get().notifications.slice(0, limit);
  }

  get(id: string): Notification | null {
    return this.activity.domain.global.get().notifications.find((n) => n.id === id) ?? null;
  }

  /** Emoji are stripped at this boundary — a belt over the prompt's no-emoji rule. */
  create(input: {
    kind: NotificationKind;
    title: string;
    body?: string;
    appId?: string;
    source: NotificationSource;
    action?: NotificationAction;
  }): Promise<Notification> {
    return this.activity.enqueue(async () => {
      const now = Date.now();
      const notification: Notification = {
        id: ulid(now),
        kind: input.kind,
        title: stripEmoji(input.title),
        body: input.body ? stripEmoji(input.body) : undefined,
        appId: input.appId,
        source: input.source,
        read: false,
        action: input.action,
        createdAt: now,
      };
      const state = this.activity.domain.global.get();
      await this.activity.domain.global.set({
        ...state,
        notifications: [notification, ...state.notifications].slice(0, CAP),
      });
      return notification;
    });
  }

  clearAll(): Promise<void> {
    return this.activity.enqueue(async () => {
      const state = this.activity.domain.global.get();
      await this.activity.domain.global.set({ ...state, notifications: [] });
    });
  }

  markRead(id: string | 'all'): Promise<void> {
    return this.activity.enqueue(async () => {
      const state = this.activity.domain.global.get();
      const notifications = state.notifications.map((n) =>
        n.read || (id !== 'all' && n.id !== id) ? n : { ...n, read: true },
      );
      await this.activity.domain.global.set({ ...state, notifications });
    });
  }
}
