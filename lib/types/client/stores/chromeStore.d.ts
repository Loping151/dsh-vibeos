/**
 * Per-window state of a native chrome shell (e.g. a browser's current URL).
 * Updated by the AI content via the `chrome` syscall (s2c.chrome.set) and by
 * the chrome component's own interactions.
 */
interface ChromeStoreState {
    states: Record<string, Record<string, string>>;
    set: (windowId: string, patch: Record<string, string>) => void;
    clear: (windowId: string) => void;
}
export declare const useChromeStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ChromeStoreState>>;
export {};
