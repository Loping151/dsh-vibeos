import { type SkinManifest } from '../../shared/domain/skin';
/** One `skins.custom[]` config row (§B.2). */
export interface CustomSkinEntry {
    name: string;
    label?: string;
    css: string;
    dswTokens?: Record<string, {
        light: string;
        dark: string;
    }>;
}
export interface CustomSkinRejection {
    name: string;
    reason: string;
}
export interface PreparedCustomSkins {
    /** Accepted skins, css already scoped to `#vibeos-root[data-skin="<name>"]`. */
    skins: SkinManifest[];
    rejected: CustomSkinRejection[];
    warnings: string[];
}
export declare const CUSTOM_SKIN_NAME_PATTERN: RegExp;
export declare const CUSTOM_SKIN_MAX_CSS_BYTES = 131072;
export declare const SKIN_ROOT_SELECTOR = "#vibeos-root";
/** Tokens the UI-generation prompt exposes to the model; a skin that skips one leaks the base theme. */
export declare const AI_CONTRACT_TOKENS: readonly string[];
/**
 * Validate + scope the configured custom skins. Never throws: a bad entry is
 * dropped with a reason so one typo cannot take the desktop down.
 */
export declare function prepareCustomSkins(entries: readonly CustomSkinEntry[]): PreparedCustomSkins;
/**
 * Enforce the custom-skin contract and prefix every selector with `#vibeos-root`
 * so the skin cannot escape the desktop container. Throws on any violation.
 */
export declare function scopeSkinCss(name: string, source: string): string;
