/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/prompt/presetTemplates.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

import type { PresetAppId } from '../../shared';

/**
 * Hints that seed the AI's first render for preset apps. These are NOT the
 * literal HTML — they describe the kind of app the AI should hallucinate so
 * preset apps feel recognizable while still being AI-generated.
 */
const HINTS: Partial<Record<PresetAppId, string>> = {
  browser:
    "A web browser. Structure: a top chrome containing back/forward buttons and the address bar wrapped in its OWN region: <form data-vibeos-region='addressbar' data-vibeos-action='navigate'><input name='url' value='<current url>' …></form>; then the page body as <div data-vibeos-region='page'>…</div>. " +
    "CRITICAL navigation: the user's typed text arrives in the OPERATION as value=/form=. On navigate you MUST return BOTH regions: (1) data-vibeos-region='addressbar' with the input value set to the EXACT URL the user typed, and (2) data-vibeos-region='page' rendering the page the user ASKED FOR (not a random/homepage). Never ignore the user's input or keep the old URL. Links inside the page carry data-vibeos-action='navigate' data-url='…'. " +
    "REAL SITES: when the URL is a real-world site (baidu.com, github.com, zhihu.com, …), render a CONVINCING replica of that site's actual page: its layout, color scheme, typography feel, logo drawn with styled text/CSS shapes (never <img> from the real domain), its signature modules (search box, nav, feed, sidebar), plausible dense content in the site's own language. Every link/button/search works via data-vibeos-action and navigates to further in-site pages. Search on the replica returns believable results. NEVER say the page cannot be loaded, never render an empty or placeholder page, never break character about the content's origin. GROUND IN REALITY: you have web_search / web_fetch tools — for real sites CALL web_fetch(url) first and rebuild the page from the real content; for search-engine queries CALL web_search(query) and render the REAL results (real titles, real snippets; keep each real URL in data-url so clicking navigates there). In-page search boxes submit as a navigate action carrying the engine's real query URL (e.g. https://www.baidu.com/s?wd=<query>).",
  'command-line':
    "A terminal emulator. The OS itself draws the prompt line 'dev@vibeos:~$ ' and echoes the command: never render an input, a form, a prompt line, your own hostname prompt, or the command the user typed. " +
    "FIRST RENDER ONLY: output the boot banner as <div data-vibeos-region='scrollback' style='padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.35'>…1-3 banner lines…</div>. " +
    "EVERY LATER TURN: the scrollback above is IMMUTABLE and already on screen — you may only APPEND. Still answer inside the usual <vibeos-html>…</vibeos-html> envelope, but put ONLY the new output lines inside it: bare sibling <div> elements, one per line, with NO surrounding container and NO data-vibeos-region attribute. Never repeat earlier lines, never restate the command, never wrap them in the region again. " +
    "Respond plausibly to EVERY command, known or not, with AT LEAST ONE line of output (unknown → 'command not found'; 'ls' lists plausible files; a command that truly prints nothing still gets a status line). 'clear' outputs the single token CLEAR and nothing else. Align columns with plain spaces (monospace); box-drawing tables, trees and progress bars are welcome.",
  'file-manager':
    "A file manager browsing the VibeOS virtual filesystem. Show a toolbar, a path breadcrumb, and a grid/list of files & folders (each data-vibeos-action='open' data-name=...). Reflect any real desktop files from system state when known.",
  settings:
    'A system settings panel. Show sections for Appearance (theme), About (boot count, version), and Model performance. Controls carry data-vibeos-action. Keep it consistent with the real settings provided in system state.',
};

export function presetHint(presetId: PresetAppId | undefined): string | undefined {
  if (!presetId) return undefined;
  return HINTS[presetId];
}
