import type { Notification, NotificationAction, NotificationKind, NotificationSource } from '../../../shared';
import type { ActivityHandle } from '../domains';
export declare class NotificationRepo {
    private readonly activity;
    constructor(activity: ActivityHandle);
    /** Newest first. */
    listRecent(limit?: number): Notification[];
    get(id: string): Notification | null;
    /** Emoji are stripped at this boundary — a belt over the prompt's no-emoji rule. */
    create(input: {
        kind: NotificationKind;
        title: string;
        body?: string;
        appId?: string;
        source: NotificationSource;
        action?: NotificationAction;
    }): Promise<Notification>;
    clearAll(): Promise<void>;
    markRead(id: string | 'all'): Promise<void>;
}
