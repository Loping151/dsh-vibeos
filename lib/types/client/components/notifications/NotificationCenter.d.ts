import { type ReactNode } from 'react';
interface CenterState {
    open: boolean;
    toggle: () => void;
    close: () => void;
}
/** Shared between the taskbar tray (toggle) and the desktop (render). */
export declare const useNotificationCenterStore: import("zustand").UseBoundStore<import("zustand").StoreApi<CenterState>>;
export declare function NotificationCenter(props: {
    open: boolean;
    onClose: () => void;
}): ReactNode;
export {};
