/** Skin registry: built-ins + config/programmatic skins, one <style data-vibeos-skin>
 * per registered css block, and the active-skin state every tab of the desktop
 * renders from. All css must be scoped under [data-skin="<id>"]; the injector
 * prefixes #vibeos-root so no rule can leak onto the DSH page. */

import { useSyncExternalStore } from 'react';
import type { SkinManifest, SkinTokenPair } from '../../shared/index';
import { DEFAULT_SKIN } from '../../shared/index';
import { BUILTIN_DSW_TOKENS } from '../styles/dswTokens';

export interface SkinRegistration {
  id: string;
  label: string;
  /** CSS with every rule scoped under [data-skin="<id>"]; empty/omitted when the css ships in the base stylesheet. */
  css?: string;
  /** DSH chrome bridge tokens, applied via ctx.theme while desktop mode is active. */
  dswTokens?: Record<string, SkinTokenPair>;
}

interface SkinRecord {
  manifest: SkinManifest;
  styleTag: HTMLStyleElement | null;
}

const records = new Map<string, SkinRecord>();
const order: string[] = [];
let current = DEFAULT_SKIN;
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version++;
  for (const fn of listeners) fn();
}

function wrapSkinCss(id: string, css: string): string | null {
  if (/(^|[}\s,])(:root|html|body)\s*[{,]/.test(css)) return null;
  if (!css.includes(`[data-skin="${id}"]`) && !css.includes(`[data-skin='${id}']`)) return null;
  return css.replace(/(^|[^\w#-])\[data-skin=/g, (_, pre: string) => `${pre}#vibeos-root[data-skin=`);
}

function put(reg: SkinRegistration, builtin: boolean): SkinRecord | null {
  let styleTag: HTMLStyleElement | null = null;
  const css = reg.css ?? '';
  if (css) {
    const wrapped = wrapSkinCss(reg.id, css);
    if (wrapped === null) {
      console.warn(
        `[vibeos] skin "${reg.id}" rejected: css must be scoped under [data-skin="${reg.id}"] and must not target :root/html/body`,
      );
      return null;
    }
    styleTag = document.createElement('style');
    styleTag.dataset.vibeosSkin = reg.id;
    styleTag.textContent = wrapped;
    document.head.appendChild(styleTag);
  }
  const prev = records.get(reg.id);
  prev?.styleTag?.remove();
  const record: SkinRecord = {
    manifest: {
      id: reg.id,
      label: reg.label,
      css,
      dswTokens: reg.dswTokens,
      builtin,
    },
    styleTag,
  };
  records.set(reg.id, record);
  if (!order.includes(reg.id)) order.push(reg.id);
  bump();
  return record;
}

export function registerSkin(reg: SkinRegistration): () => void {
  const record = put(reg, false);
  if (!record) return () => {};
  return () => {
    if (records.get(reg.id) !== record) return;
    record.styleTag?.remove();
    records.delete(reg.id);
    const i = order.indexOf(reg.id);
    if (i !== -1) order.splice(i, 1);
    if (current === reg.id) applySkin(DEFAULT_SKIN);
    else bump();
  };
}

/** Boot-state hydration: same as registerSkin but replace-in-place, no disposer. */
export function registerBootSkin(manifest: SkinManifest): void {
  if (manifest.builtin) return;
  put({ id: manifest.id, label: manifest.label, css: manifest.css, dswTokens: manifest.dswTokens }, false);
}

/** Built-ins first, then registration order. */
export function listSkins(): SkinManifest[] {
  const builtins: SkinManifest[] = [];
  const rest: SkinManifest[] = [];
  for (const id of order) {
    const r = records.get(id);
    if (!r) continue;
    (r.manifest.builtin ? builtins : rest).push(r.manifest);
  }
  return [...builtins, ...rest];
}

export function getSkinManifest(id: string): SkinManifest | undefined {
  return records.get(id)?.manifest;
}

/** Unknown ids fall back to the default skin. Notifies subscribers (render + theme bridge). */
export function applySkin(id: string): void {
  const resolved = records.has(id) ? id : DEFAULT_SKIN;
  if (resolved === current) return;
  current = resolved;
  bump();
}

export function getCurrentSkin(): string {
  return current;
}

export function skinsVersion(): number {
  return version;
}

export function subscribeSkins(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Active skin id for the desktop root's data-skin attribute. */
export function useSkin(): string {
  useSyncExternalStore(subscribeSkins, skinsVersion, skinsVersion);
  return current;
}

// Built-ins: css ships in the base stylesheet (styles/skins/*.css), so css:'';
// xp/aqua carry the hand-tuned DSH bridge palettes (styles/dswTokens.ts).
put({ id: 'devdock', label: 'DevDock' }, true);
put({ id: 'xp', label: 'Windows XP', dswTokens: BUILTIN_DSW_TOKENS.xp }, true);
put({ id: 'aqua', label: 'Mac Aqua', dswTokens: BUILTIN_DSW_TOKENS.aqua }, true);
put({ id: 'harness', label: 'Harness' }, true);
