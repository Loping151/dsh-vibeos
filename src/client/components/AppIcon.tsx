/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/AppIcon.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): the Phosphor tables become the inline-SVG icon modules
 * plus the icon registry; the monogram fallback moved to icons/monogram. Original license: MIT. */

import { useSyncExternalStore, type ReactNode } from 'react';
import type { PresetAppId } from '../../shared/index';
import { PRESET_ICONS } from '../icons/appIcons';
import { Monogram } from '../icons/monogram';
import { iconsVersion, resolveIcon, subscribeIcons } from '../registry/icons';

interface Props {
  /** Icon name the AI emitted (kebab-case), used for virtual apps. */
  name?: string;
  /** Preset app id — its icon is fixed in code and wins over `name`. */
  presetId?: PresetAppId;
  /** Fallback label for a monogram when the icon is unknown. */
  label?: string;
  className?: string;
}

/**
 * Resolve chain: preset table -> icon registry (built-in name map + plugin
 * registrations) -> letter monogram (never emoji).
 */
export function AppIcon({ name, presetId, label, className }: Props): ReactNode {
  useSyncExternalStore(subscribeIcons, iconsVersion, iconsVersion);
  // No class merging at runtime (tailwind-merge is not bundled): a caller-supplied
  // size must REPLACE the default, not tie with it.
  const cls = className ?? 'size-5';
  const Cmp = (presetId && PRESET_ICONS[presetId]) || (name ? resolveIcon(name) : undefined);
  if (Cmp) return <Cmp className={cls} />;
  return <Monogram source={label ?? name ?? ''} className={cls} />;
}
