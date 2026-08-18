import type { AppDescriptor } from '../../shared/index';
interface AppStoreState {
    apps: Record<string, AppDescriptor>;
    setAll: (apps: AppDescriptor[]) => void;
    upsert: (app: AppDescriptor) => void;
    remove: (appId: string) => void;
}
export declare const useAppStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AppStoreState>>;
export {};
