/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/domain/settings.ts (Skin/DEFAULT_SKIN/SKINS).
 * Adapted for DeepSeek Harness (dsh-vibeos): the closed skin union becomes an open registry. Original license: MIT. */

/** A DSH theme token override value; both modes are required by ctx.theme.overrideTokens. */
export interface SkinTokenPair {
  light: string;
  dark: string;
}

export interface SkinManifest {
  /** `data-skin` value on #vibeos-root. */
  id: string;
  label: string;
  /** CSS with every rule scoped under [data-skin="<id>"]. Empty for built-ins (already in the bundle stylesheet). */
  css?: string;
  /** DSH chrome bridge: `--dsw-*` var name -> {light, dark}, applied while desktop mode is active. */
  dswTokens?: Record<string, SkinTokenPair>;
  builtin: boolean;
}

export const DEFAULT_SKIN = 'devdock';

export const BUILTIN_SKINS: readonly SkinManifest[] = [
  { id: 'devdock', label: 'DevDock', css: '', builtin: true },
  { id: 'xp', label: 'Windows XP', css: '', builtin: true },
  { id: 'aqua', label: 'Mac Aqua', css: '', builtin: true },
  { id: 'harness', label: 'Harness', css: '', builtin: true },
];
