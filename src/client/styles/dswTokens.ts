/* Palettes derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/styles/globals.css (xp/aqua skins);
 * the --dsw-* token vocabulary follows the dsh-client-ui-theme-xp precedent. Original license: MIT. */

import type { SkinTokenPair } from '../../shared/domain/skin';

/** xp/aqua are scheme-invariant looks, so both palette modes get the same value. */
function fixed(tokens: Record<string, string>): Record<string, SkinTokenPair> {
  const out: Record<string, SkinTokenPair> = {};
  for (const [name, value] of Object.entries(tokens)) out[name] = { light: value, dark: value };
  return out;
}

/** Windows XP Luna: silver-blue chrome, Tahoma, saturated selection blue. */
export const XP_DSW_TOKENS: Record<string, SkinTokenPair> = fixed({
  '--dsw-font-family': 'Tahoma, Verdana, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',

  '--dsw-alias-bg-base': '#ffffff',
  '--dsw-alias-bg-layer-1': '#fbfcfe',
  '--dsw-alias-bg-layer-2': '#f2f5fa',
  '--dsw-alias-bg-layer-3': '#e8eef7',
  '--dsw-alias-bg-module-platform': '#eef2f8',
  '--dsw-alias-bg-overlay': '#f7f9fc',
  '--dsw-alias-bg-skeleton': 'rgba(49, 106, 197, 0.08)',

  '--dsw-alias-border-l1': 'rgba(49, 106, 197, 0.16)',
  '--dsw-alias-border-l2': 'rgba(49, 106, 197, 0.22)',
  '--dsw-alias-border-l3': '#a8bcd8',

  '--dsw-alias-brand-primary': '#316ac5',
  '--dsw-alias-brand-primary-invert': '#ffffff',
  '--dsw-alias-brand-text': '#316ac5',

  '--dsw-alias-button-primary-fill': '#316ac5',
  '--dsw-alias-button-primary-hover': '#3d7be0',
  '--dsw-alias-button-elevated-fill': '#ffffff',
  '--dsw-alias-button-floating-fill': '#f6f8fb',
  '--dsw-alias-button-floating-hover': '#e6edf8',

  '--dsw-alias-interactive-bg-hover': 'rgba(49, 106, 197, 0.08)',
  '--dsw-alias-interactive-bg-hover-solid': '#e6edf8',
  '--dsw-alias-interactive-bg-active': 'rgba(49, 106, 197, 0.16)',

  '--dsw-alias-label-primary': '#101b2e',
  '--dsw-alias-label-secondary': '#33445e',
  '--dsw-alias-label-tertiary': '#5c6f8a',
  '--dsw-alias-label-primary-inverted': '#ffffff',

  '--dsw-alias-scrollbar-bg-l1': '#c3ccd8',
  '--dsw-alias-scrollbar-bg-l2': '#b6c2d2',
  '--dsw-alias-scrollbar-hover-l1': '#316ac5',
  '--dsw-alias-scrollbar-hover-l2': '#316ac5',

  '--dsw-alias-state-error-primary': '#c00000',
  '--dsw-alias-state-success-primary': '#3d9400',
  '--dsw-alias-state-warn-primary': '#d98300',

  '--dsw-alias-toast-bg': '#2b3f66',
  '--dsw-alias-tooltip-bg': '#ffffe1',

  '--dsw-specific-menu': '#fbfcfe',
  '--dsw-specific-input-major': '#ffffff',
  '--dsw-specific-selector': '#eef2f8',
  '--dsw-specific-sidebar-fill': 'linear-gradient(180deg, #f2f7fd 0%, #dbe9f7 100%)',
  '--dsw-specific-sidebar-nav-item-active': '#cfe0f7',
  '--dsw-specific-sidebar-nav-item-hover': '#e3edf9',
});

/** Mac OS X Aqua: brushed-metal grays, glossy blue accent, Lucida Grande. */
export const AQUA_DSW_TOKENS: Record<string, SkinTokenPair> = fixed({
  '--dsw-font-family':
    '"Lucida Grande", "Helvetica Neue", Helvetica, Arial, "PingFang SC", sans-serif',

  '--dsw-alias-bg-base': '#f2f2f2',
  '--dsw-alias-bg-layer-1': '#ffffff',
  '--dsw-alias-bg-layer-2': '#f0f0f0',
  '--dsw-alias-bg-layer-3': '#e4e4e4',
  '--dsw-alias-bg-module-platform': '#ededed',
  '--dsw-alias-bg-overlay': '#fbfbfb',
  '--dsw-alias-bg-skeleton': 'rgba(0, 0, 0, 0.06)',

  '--dsw-alias-border-l1': 'rgba(0, 0, 0, 0.1)',
  '--dsw-alias-border-l2': 'rgba(0, 0, 0, 0.16)',
  '--dsw-alias-border-l3': '#c9c9c9',

  '--dsw-alias-brand-primary': '#3a9bff',
  '--dsw-alias-brand-primary-invert': '#ffffff',
  '--dsw-alias-brand-text': '#1f6fd0',

  '--dsw-alias-button-primary-fill': '#3a9bff',
  '--dsw-alias-button-primary-hover': '#59acff',
  '--dsw-alias-button-elevated-fill': '#ffffff',
  '--dsw-alias-button-floating-fill': '#f7f7f7',
  '--dsw-alias-button-floating-hover': '#ececec',

  '--dsw-alias-interactive-bg-hover': 'rgba(58, 155, 255, 0.1)',
  '--dsw-alias-interactive-bg-hover-solid': '#e6f0fb',
  '--dsw-alias-interactive-bg-active': 'rgba(58, 155, 255, 0.18)',

  '--dsw-alias-label-primary': '#1a1a1a',
  '--dsw-alias-label-secondary': '#4a4a4a',
  '--dsw-alias-label-tertiary': '#767676',
  '--dsw-alias-label-primary-inverted': '#ffffff',

  '--dsw-alias-scrollbar-bg-l1': '#c7c7c7',
  '--dsw-alias-scrollbar-bg-l2': '#bcbcbc',
  '--dsw-alias-scrollbar-hover-l1': '#9a9a9a',
  '--dsw-alias-scrollbar-hover-l2': '#9a9a9a',

  '--dsw-alias-state-error-primary': '#d0342c',
  '--dsw-alias-state-success-primary': '#2f9e44',
  '--dsw-alias-state-warn-primary': '#d98300',

  '--dsw-alias-toast-bg': '#3c3c3c',
  '--dsw-alias-tooltip-bg': '#ffffe1',

  '--dsw-specific-menu': '#fbfbfb',
  '--dsw-specific-input-major': '#ffffff',
  '--dsw-specific-selector': '#eaeaea',
  '--dsw-specific-sidebar-fill': 'linear-gradient(180deg, #e8eaee 0%, #d8dce3 100%)',
  '--dsw-specific-sidebar-nav-item-active': '#cfe0f7',
  '--dsw-specific-sidebar-nav-item-hover': '#e6e9ee',
});

/** Skin id -> DSH chrome bridge tokens; devdock and harness intentionally ship none. */
export const BUILTIN_DSW_TOKENS: Record<string, Record<string, SkinTokenPair>> = {
  xp: XP_DSW_TOKENS,
  aqua: AQUA_DSW_TOKENS,
};
