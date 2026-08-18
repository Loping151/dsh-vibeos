import type { Settings } from '../../shared/index';
interface SettingsStoreState {
    settings: Settings | null;
    set: (settings: Settings) => void;
}
export declare const useSettingsStore: import("zustand").UseBoundStore<import("zustand").StoreApi<SettingsStoreState>>;
export {};
