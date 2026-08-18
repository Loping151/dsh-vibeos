import type { Locale, Settings } from '../../../shared';
import type { CoreHandle } from '../domains';
export declare class SettingsRepo {
    private readonly core;
    constructor(core: CoreHandle);
    loadSettings(): Settings;
    /** Materialize the singleton on first boot; `seed` supplies plugin-config defaults. */
    ensureSettings(seed?: {
        skin?: string;
        locale?: Locale;
    }): Promise<Settings>;
    /**
     * Deep merge: per-role model config and per-key prefs merge instead of being
     * replaced, so updating one field never wipes the rest.
     */
    updateSettings(partial: Partial<Settings>): Promise<Settings>;
}
