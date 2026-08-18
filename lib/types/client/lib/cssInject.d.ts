/** Idempotent stylesheet injector following the dsh client CSS convention:
 * `data-plugin` lets the HMR chain remove the tag on unload, `data-plugin-css`
 * dedupes; re-apply refreshes the content instead of duplicating the tag. */
export declare function injectStyles(css: string): void;
export declare function removeStyles(): void;
