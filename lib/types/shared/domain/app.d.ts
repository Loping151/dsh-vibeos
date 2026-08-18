export type PresetAppId = 'browser' | 'command-line' | 'file-manager' | 'settings' | 'activity-monitor' | 'app-store' | 'recycle-bin' | 'welcome';
export type AppKind = 'preset' | 'virtual';
/** Preset apps rendered natively (real React), never AI-hallucinated. */
export declare const NATIVE_PRESET_APPS: PresetAppId[];
export interface AppManifest {
    /** Short description used to seed the AI prompt for a virtual app. */
    description?: string;
    /** Optional category for grouping in the start menu. */
    category?: string;
    /** Default window size hint. */
    defaultSize?: {
        w: number;
        h: number;
    };
    /** Minimum window size — resize is clamped to this (falls back to global min). */
    minSize?: {
        w: number;
        h: number;
    };
    /**
     * Native chrome to render around the AI content (e.g. "browser" -> a built-in
     * address bar). The AI generates only the content; it updates the chrome via
     * the `chrome` syscall, and chrome interactions are sent back as ops.
     */
    chrome?: string;
    /**
     * If true, only ONE window of this app may exist — opening it again focuses
     * the existing window (e.g. Settings, Recycle Bin).
     */
    singleInstance?: boolean;
    /**
     * A frozen HTML snapshot. When set, opening the app seeds the window with this
     * markup immediately (instead of an AI first render).
     */
    seedHtml?: string;
    [key: string]: unknown;
}
export interface AppDescriptor {
    id: string;
    name: string;
    kind: AppKind;
    /** Set when kind === 'preset'. */
    presetId?: PresetAppId;
    /** Icon identifier (icon registry name) or letter monogram source. */
    icon: string;
    manifest: AppManifest;
    isInstalled: boolean;
    createdAt: number;
    updatedAt: number;
}
