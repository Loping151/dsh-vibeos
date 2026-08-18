/** Dictionary extension registry: companion plugins add/override chrome strings
 * per locale; useT() subscribes to the version so late extensions re-render. */
import type { Locale } from '../../shared/index';
export declare function extendDict(locale: Locale, dict: Record<string, string>): () => void;
/** Last registration wins per key (scan newest → oldest). */
export declare function lookupExt(locale: Locale, key: string): string | undefined;
export declare function i18nVersion(): number;
export declare function subscribeI18n(fn: () => void): () => void;
