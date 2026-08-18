/** Idempotent stylesheet injector following the dsh client CSS convention:
 * `data-plugin` lets the HMR chain remove the tag on unload, `data-plugin-css`
 * dedupes; re-apply refreshes the content instead of duplicating the tag. */

const PLUGIN_ID = 'dsh-vibeos';
const CSS_TAG_ID = 'dsh-vibeos/app.css';

export function injectStyles(css: string): void {
  if (typeof document === 'undefined') return;
  let tag = document.querySelector<HTMLStyleElement>(
    `style[data-plugin-css=${JSON.stringify(CSS_TAG_ID)}]`,
  );
  if (!tag) {
    tag = document.createElement('style');
    tag.dataset.plugin = PLUGIN_ID;
    tag.dataset.pluginCss = CSS_TAG_ID;
    document.head.appendChild(tag);
  }
  if (tag.textContent !== css) tag.textContent = css;
}

export function removeStyles(): void {
  if (typeof document === 'undefined') return;
  document
    .querySelector(`style[data-plugin-css=${JSON.stringify(CSS_TAG_ID)}]`)
    ?.remove();
}
