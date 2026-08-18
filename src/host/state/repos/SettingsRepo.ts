/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/SettingsRepo.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): the settings row becomes half of the vibeos_core global; provider
 * and apiProviders are gone (DSH owns routing), skin is an open string. Original license: MIT. */

import type { Locale, Settings } from '../../../shared';
import { DEFAULT_SETTINGS } from '../../../shared';
import type { CoreHandle } from '../domains';

export class SettingsRepo {
  constructor(private readonly core: CoreHandle) {}

  loadSettings(): Settings {
    return this.core.domain.global.get().settings;
  }

  /** Materialize the singleton on first boot; `seed` supplies plugin-config defaults. */
  ensureSettings(seed?: { skin?: string; locale?: Locale }): Promise<Settings> {
    return this.core.enqueue(async () => {
      const state = this.core.domain.global.get();
      if (state.settings.updatedAt !== 0) return state.settings;
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        skin: seed?.skin ?? DEFAULT_SETTINGS.skin,
        locale: seed?.locale ?? DEFAULT_SETTINGS.locale,
        modelOverrides: { ...DEFAULT_SETTINGS.modelOverrides },
        prefs: { proactiveAgents: true, ...DEFAULT_SETTINGS.prefs },
        updatedAt: Date.now(),
      };
      await this.core.domain.global.set({ ...state, settings });
      return settings;
    });
  }

  /**
   * Deep merge: per-role model config and per-key prefs merge instead of being
   * replaced, so updating one field never wipes the rest.
   */
  updateSettings(partial: Partial<Settings>): Promise<Settings> {
    return this.core.enqueue(async () => {
      const state = this.core.domain.global.get();
      const current = state.settings;
      const modelOverrides = { ...current.modelOverrides };
      for (const [role, cfg] of Object.entries(partial.modelOverrides ?? {})) {
        const key = role as keyof typeof modelOverrides;
        if (cfg === null) delete modelOverrides[key];
        else modelOverrides[key] = { ...modelOverrides[key], ...cfg };
      }
      const settings: Settings = {
        theme: partial.theme ?? current.theme,
        skin: partial.skin ?? current.skin,
        locale: partial.locale ?? current.locale,
        userProfile: partial.userProfile ?? current.userProfile,
        modelOverrides,
        prefs: { ...current.prefs, ...partial.prefs },
        updatedAt: Date.now(),
      };
      await this.core.domain.global.set({ ...state, settings });
      return settings;
    });
  }
}
