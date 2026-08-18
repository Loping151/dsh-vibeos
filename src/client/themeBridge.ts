/** DSH chrome bridge: while desktop mode is active and the skin ships dswTokens
 * (and settings.prefs.bridgeDshTheme !== false), overlay them on the DSH theme
 * via ctx.theme.overrideTokens('dsh-vibeos', …). Disposed on skin change,
 * classic switch, and plugin dispose — classic mode is instantly stock. */

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-theme/client';
import { getCurrentSkin, getSkinManifest, subscribeSkins } from './registry/skins';
import { useModeStore } from './stores/modeStore';
import { useSettingsStore } from './stores/settingsStore';

class ThemeBridge {
  private ctx: Context | null = null;
  private applied: (() => void) | null = null;
  private appliedTokens: object | null = null;
  private unsubs: Array<() => void> = [];

  init(ctx: Context): void {
    this.ctx = ctx;
    this.unsubs.push(
      subscribeSkins(() => this.reevaluate()),
      useModeStore.subscribe(() => this.reevaluate()),
      useSettingsStore.subscribe(() => this.reevaluate()),
    );
    this.reevaluate();
  }

  reevaluate(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const mode = useModeStore.getState().mode;
    const settings = useSettingsStore.getState().settings;
    const bridgeOn = settings?.prefs?.bridgeDshTheme !== false;
    const skinId = getCurrentSkin();
    const tokens = getSkinManifest(skinId)?.dswTokens;
    const want =
      mode === 'desktop' && bridgeOn && tokens && Object.keys(tokens).length > 0
        ? tokens
        : null;
    if (want === this.appliedTokens) return;
    this.applied?.();
    this.applied = null;
    this.appliedTokens = null;
    if (want) {
      this.applied = ctx.theme.overrideTokens('dsh-vibeos', want);
      this.appliedTokens = want;
    }
  }

  dispose(): void {
    this.applied?.();
    this.applied = null;
    this.appliedTokens = null;
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.ctx = null;
  }
}

export const themeBridge = new ThemeBridge();
