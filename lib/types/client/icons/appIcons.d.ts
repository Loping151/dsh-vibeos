import type { FC } from 'react';
import type { PresetAppId } from '../../shared/index';
import { type IconProps } from './uiIcons';
/** Built-in apps have FIXED icons defined here in code — never from the DB. */
export declare const PRESET_ICONS: Record<PresetAppId, FC<IconProps>>;
/** Maps the (lucide-style) icon names the AI emits onto the inline glyph set. */
export declare const NAME_ICONS: Record<string, FC<IconProps>>;
