import type { Locale } from '../../shared/index';
/** Browser-derived default when the user hasn't chosen a language yet. */
export declare function browserLocale(): Locale;
export declare function translate(locale: Locale, key: string): string;
/** Current effective locale: the chosen one, else the browser default. */
export declare function useLocale(): Locale;
/** Translator bound to the current locale; re-renders when extensions register. */
export declare function useT(): (key: string) => string;
