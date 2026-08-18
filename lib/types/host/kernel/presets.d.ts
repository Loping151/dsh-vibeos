import type { AppManifest, PresetAppId } from '../../shared';
export interface PresetAppDefinition {
    id: PresetAppId;
    name: string;
    /** Icon registry name (lucide vocabulary), rendered by <AppIcon>. */
    icon: string;
    manifest: AppManifest;
}
export declare const PRESET_APPS: readonly PresetAppDefinition[];
export declare function presetById(id: string): PresetAppDefinition | undefined;
