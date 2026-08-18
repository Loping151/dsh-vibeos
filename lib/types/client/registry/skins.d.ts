/** Skin registry: built-ins + config/programmatic skins, one <style data-vibeos-skin>
 * per registered css block, and the active-skin state every tab of the desktop
 * renders from. All css must be scoped under [data-skin="<id>"]; the injector
 * prefixes #vibeos-root so no rule can leak onto the DSH page. */
import type { SkinManifest, SkinTokenPair } from '../../shared/index';
export interface SkinRegistration {
    id: string;
    label: string;
    /** CSS with every rule scoped under [data-skin="<id>"]; empty/omitted when the css ships in the base stylesheet. */
    css?: string;
    /** DSH chrome bridge tokens, applied via ctx.theme while desktop mode is active. */
    dswTokens?: Record<string, SkinTokenPair>;
}
export declare function registerSkin(reg: SkinRegistration): () => void;
/** Boot-state hydration: same as registerSkin but replace-in-place, no disposer. */
export declare function registerBootSkin(manifest: SkinManifest): void;
/** Built-ins first, then registration order. */
export declare function listSkins(): SkinManifest[];
export declare function getSkinManifest(id: string): SkinManifest | undefined;
/** Unknown ids fall back to the default skin. Notifies subscribers (render + theme bridge). */
export declare function applySkin(id: string): void;
export declare function getCurrentSkin(): string;
export declare function skinsVersion(): number;
export declare function subscribeSkins(fn: () => void): () => void;
/** Active skin id for the desktop root's data-skin attribute. */
export declare function useSkin(): string;
