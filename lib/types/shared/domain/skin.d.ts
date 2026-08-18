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
export declare const DEFAULT_SKIN = "devdock";
export declare const BUILTIN_SKINS: readonly SkinManifest[];
