import type { FC, ReactNode } from 'react';
export type NativeAppRenderer = (windowId: string) => ReactNode;
export type ChromeComponent = FC<{
    windowId: string;
    children: ReactNode;
}>;
/** Latest registration for a presetId wins (built-ins register first). */
export declare function registerNativeApp(presetId: string, render: NativeAppRenderer): () => void;
export declare function getNativeApp(presetId: string | undefined): NativeAppRenderer | undefined;
/** Latest registration for a chrome key wins ('browser' is built in). */
export declare function registerChrome(key: string, comp: ChromeComponent): () => void;
export declare function getChrome(key: string | undefined): ChromeComponent | undefined;
export declare function appsRegistryVersion(): number;
export declare function subscribeAppsRegistry(fn: () => void): () => void;
