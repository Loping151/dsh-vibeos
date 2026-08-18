import { type ReactNode } from 'react';
import type { PresetAppId } from '../../shared/index';
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
export declare function AppIcon({ name, presetId, label, className }: Props): ReactNode;
export {};
