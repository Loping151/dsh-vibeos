/** Dictionary extension registry: companion plugins add/override chrome strings
 * per locale; useT() subscribes to the version so late extensions re-render. */

import type { Locale } from '../../shared/index';

interface ExtEntry {
  locale: Locale;
  dict: Record<string, string>;
}

const entries: ExtEntry[] = [];
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version++;
  for (const fn of listeners) fn();
}

export function extendDict(locale: Locale, dict: Record<string, string>): () => void {
  const entry: ExtEntry = { locale, dict: { ...dict } };
  entries.push(entry);
  bump();
  return () => {
    const i = entries.indexOf(entry);
    if (i !== -1) {
      entries.splice(i, 1);
      bump();
    }
  };
}

/** Last registration wins per key (scan newest → oldest). */
export function lookupExt(locale: Locale, key: string): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if (e.locale === locale && e.dict[key] !== undefined) return e.dict[key];
  }
  return undefined;
}

export function i18nVersion(): number {
  return version;
}

export function subscribeI18n(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
