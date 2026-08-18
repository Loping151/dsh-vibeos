/** Desktop-takeover vs classic (stock DSH) mode. The persisted truth is
 * settings.prefs.classicMode (all tabs converge via s2c.settings.changed);
 * localStorage only seeds the pre-connect guess. */
export type VibeosMode = 'desktop' | 'classic';
export declare const LAST_MODE_KEY = "vibeos.lastMode";
interface ModeState {
    mode: VibeosMode;
    set: (mode: VibeosMode) => void;
}
export declare const useModeStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ModeState>>;
export {};
