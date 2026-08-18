import { BUILTIN_SKINS, type SkinManifest, type SkinTokenPair } from '../../shared/domain/skin';

/** One `skins.custom[]` config row (§B.2). */
export interface CustomSkinEntry {
  name: string;
  label?: string;
  css: string;
  dswTokens?: Record<string, { light: string; dark: string }>;
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

export const CUSTOM_SKIN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
export const CUSTOM_SKIN_MAX_CSS_BYTES = 131_072;
export const SKIN_ROOT_SELECTOR = '#vibeos-root';

/** Tokens the UI-generation prompt exposes to the model; a skin that skips one leaks the base theme. */
export const AI_CONTRACT_TOKENS: readonly string[] = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--muted',
  '--muted-foreground',
  '--border',
  '--primary',
  '--primary-foreground',
  '--accent',
  '--accent-foreground',
  '--brand',
  '--destructive',
  '--run',
  '--warn',
  '--radius',
];

const NESTED_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'scope']);
const VERBATIM_AT_RULES = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes']);
const AI_SURFACE_LAYOUT_PROPS = /(^|[;{\s])(display|flex-direction|flex-flow|flex-wrap)\s*:/i;

class SkinCssError extends Error {}

/**
 * Validate + scope the configured custom skins. Never throws: a bad entry is
 * dropped with a reason so one typo cannot take the desktop down.
 */
export function prepareCustomSkins(entries: readonly CustomSkinEntry[]): PreparedCustomSkins {
  const skins: SkinManifest[] = [];
  const rejected: CustomSkinRejection[] = [];
  const warnings: string[] = [];
  const taken = new Set(BUILTIN_SKINS.map((skin) => skin.id));

  for (const entry of entries) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    try {
      if (!CUSTOM_SKIN_NAME_PATTERN.test(name)) {
        throw new SkinCssError(`name must match ${String(CUSTOM_SKIN_NAME_PATTERN)}`);
      }
      if (taken.has(name)) throw new SkinCssError('name collides with an already registered skin');

      const css = scopeSkinCss(name, entry.css ?? '');
      const dswTokens = validateDswTokens(entry.dswTokens);
      const missing = AI_CONTRACT_TOKENS.filter((token) => !definesToken(css, token));
      if (missing.length > 0) {
        warnings.push(`skin "${name}" does not define ${missing.join(', ')} (falls back to the base theme)`);
      }

      taken.add(name);
      skins.push({
        id: name,
        label: typeof entry.label === 'string' && entry.label.trim() !== '' ? entry.label : name,
        css,
        ...(dswTokens === undefined ? {} : { dswTokens }),
        builtin: false,
      });
    } catch (error) {
      rejected.push({
        name: name === '' ? '<unnamed>' : name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { skins, rejected, warnings };
}

/**
 * Enforce the custom-skin contract and prefix every selector with `#vibeos-root`
 * so the skin cannot escape the desktop container. Throws on any violation.
 */
export function scopeSkinCss(name: string, source: string): string {
  if (typeof source !== 'string') throw new SkinCssError('css must be a string');
  if (Buffer.byteLength(source, 'utf8') > CUSTOM_SKIN_MAX_CSS_BYTES) {
    throw new SkinCssError(`css exceeds ${CUSTOM_SKIN_MAX_CSS_BYTES} bytes`);
  }
  if (/<\/\s*style/i.test(source)) throw new SkinCssError('css must not contain a "</style" sequence');
  const css = stripComments(source);
  if (css.trim() === '') return '';
  return transformRules(css, name, 0);
}

function transformRules(css: string, name: string, depth: number): string {
  if (depth > 4) throw new SkinCssError('at-rule nesting is too deep');
  let out = '';
  let i = 0;

  while (i < css.length) {
    const char = css[i];
    if (char === undefined) break;
    if (/\s/.test(char)) {
      out += char;
      i += 1;
      continue;
    }
    if (char === '}') throw new SkinCssError('unbalanced "}" in css');

    const preludeEnd = findPreludeEnd(css, i);
    const prelude = css.slice(i, preludeEnd).trim();

    if (css[preludeEnd] === ';' || preludeEnd >= css.length) {
      if (prelude.startsWith('@')) throw new SkinCssError(`at-rule "${atRuleName(prelude)}" is not allowed`);
      throw new SkinCssError('declarations must live inside a scoped rule');
    }

    const blockEnd = findBlockEnd(css, preludeEnd);
    const body = css.slice(preludeEnd + 1, blockEnd);

    if (prelude.startsWith('@')) {
      const at = atRuleName(prelude);
      if (NESTED_AT_RULES.has(at)) {
        out += `${prelude}{${transformRules(body, name, depth + 1)}}`;
      } else if (VERBATIM_AT_RULES.has(at)) {
        assertSafeValues(body);
        out += `${prelude}{${body}}`;
      } else {
        throw new SkinCssError(`at-rule "@${at}" is not allowed`);
      }
    } else {
      const selectors = splitSelectors(prelude).map((selector) => scopeSelector(selector, name));
      assertSafeValues(body);
      if (selectors.some(targetsAiSurface) && AI_SURFACE_LAYOUT_PROPS.test(body)) {
        throw new SkinCssError('.ai-surface flex layout rules must not be overridden');
      }
      out += `${selectors.join(',')}{${body}}`;
    }

    i = blockEnd + 1;
  }

  return out;
}

function scopeSelector(selector: string, name: string): string {
  const trimmed = selector.trim();
  if (trimmed === '') throw new SkinCssError('empty selector');
  const scoped = trimmed.startsWith(SKIN_ROOT_SELECTOR)
    ? trimmed.slice(SKIN_ROOT_SELECTOR.length).trimStart()
    : trimmed;
  const attr = new RegExp(`^\\[\\s*data-skin\\s*=\\s*(?:"${name}"|'${name}'|${name})\\s*\\]`);
  if (!attr.test(scoped)) {
    throw new SkinCssError(
      `selector "${trimmed}" must start with [data-skin="${name}"] (bare :root, html, body and other skins are rejected)`,
    );
  }
  return SKIN_ROOT_SELECTOR + scoped;
}

function targetsAiSurface(selector: string): boolean {
  return /\.ai-surface\s*$/.test(selector);
}

function assertSafeValues(body: string): void {
  const urls = body.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi);
  for (const match of urls) {
    const target = (match[2] ?? '').trim().toLowerCase();
    if (!target.startsWith('data:') && !target.startsWith('#')) {
      throw new SkinCssError('external url() references are not allowed (offline rule); use data: URLs');
    }
  }
}

function definesToken(css: string, token: string): boolean {
  return new RegExp(`${token}\\s*:`).test(css);
}

function validateDswTokens(
  tokens: Record<string, { light: string; dark: string }> | undefined,
): Record<string, SkinTokenPair> | undefined {
  if (tokens === undefined) return undefined;
  const out: Record<string, SkinTokenPair> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (!/^--[a-zA-Z0-9-]+$/.test(key)) throw new SkinCssError(`dswTokens key "${key}" is not a css variable name`);
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof value.light !== 'string' ||
      typeof value.dark !== 'string'
    ) {
      throw new SkinCssError(`dswTokens["${key}"] must be a { light, dark } pair of strings`);
    }
    for (const mode of [value.light, value.dark]) {
      if (mode.trim() === '') throw new SkinCssError(`dswTokens["${key}"] has an empty value`);
      if (/[;{}<>]/.test(mode)) throw new SkinCssError(`dswTokens["${key}"] contains a forbidden character`);
      assertSafeValues(mode);
    }
    out[key] = { light: value.light, dark: value.dark };
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

function stripComments(css: string): string {
  let out = '';
  let i = 0;
  let quote = '';
  while (i < css.length) {
    const char = css[i] as string;
    if (quote !== '') {
      out += char;
      if (char === '\\') {
        out += css[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (char === quote) quote = '';
      i += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out += char;
      i += 1;
      continue;
    }
    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) throw new SkinCssError('unterminated css comment');
      out += ' ';
      i = end + 2;
      continue;
    }
    out += char;
    i += 1;
  }
  if (quote !== '') throw new SkinCssError('unterminated string in css');
  return out;
}

/** Index of the `{` or `;` that ends the rule prelude starting at `from`. */
function findPreludeEnd(css: string, from: number): number {
  let i = from;
  let quote = '';
  let parens = 0;
  while (i < css.length) {
    const char = css[i] as string;
    if (quote !== '') {
      if (char === '\\') i += 1;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(') {
      parens += 1;
    } else if (char === ')') {
      parens = Math.max(0, parens - 1);
    } else if (parens === 0 && (char === '{' || char === ';')) {
      return i;
    } else if (parens === 0 && char === '}') {
      throw new SkinCssError('unbalanced "}" in css');
    }
    i += 1;
  }
  return css.length;
}

/** Index of the `}` matching the `{` at `open`. */
function findBlockEnd(css: string, open: number): number {
  let i = open + 1;
  let depth = 1;
  let quote = '';
  while (i < css.length) {
    const char = css[i] as string;
    if (quote !== '') {
      if (char === '\\') i += 1;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  throw new SkinCssError('unterminated css block');
}

function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote = '';
  let parens = 0;
  let brackets = 0;
  for (let i = 0; i < prelude.length; i += 1) {
    const char = prelude[i] as string;
    if (quote !== '') {
      current += char;
      if (char === '\\') {
        current += prelude[i + 1] ?? '';
        i += 1;
      } else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') parens += 1;
    if (char === ')') parens = Math.max(0, parens - 1);
    if (char === '[') brackets += 1;
    if (char === ']') brackets = Math.max(0, brackets - 1);
    if (char === ',' && parens === 0 && brackets === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.filter((part) => part.trim() !== '');
}

function atRuleName(prelude: string): string {
  return (/^@([-a-zA-Z]+)/.exec(prelude)?.[1] ?? '').toLowerCase();
}
