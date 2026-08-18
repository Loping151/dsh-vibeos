/** Icon registry: extends the built-in lucide-vocab table with custom glyphs.
 * Custom registrations win over the built-ins; AppIcon consults resolveIcon. */
import type { FC } from 'react';
import type { IconProps } from '../icons/uiIcons';
export type IconComponent = FC<IconProps>;
export declare function registerIcon(name: string, comp: IconComponent): () => void;
export declare function resolveIcon(name: string): IconComponent | undefined;
export declare function iconsVersion(): number;
export declare function subscribeIcons(fn: () => void): () => void;
