import type { Notification } from '../../shared/index';
interface NotificationStoreState {
    notifications: Notification[];
    /** Toasts currently visible (subset, auto-dismissed). */
    toasts: Notification[];
    setAll: (notifications: Notification[]) => void;
    push: (n: Notification) => void;
    dismissToast: (id: string) => void;
    markRead: (id: string | 'all') => void;
}
export declare const useNotificationStore: import("zustand").UseBoundStore<import("zustand").StoreApi<NotificationStoreState>>;
export {};
