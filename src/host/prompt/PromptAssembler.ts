/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/prompt/PromptAssembler.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): env.snapshotBudget becomes AssembleInput.snapshotBudget
 * (config.ui.snapshotBudget). Original license: MIT. */

import type { AiOp, AppDescriptor, AppMemory, DragPayload, Interaction } from '../../shared';
import { presetHint } from './presetTemplates';

const SUMMARY_BUDGET = 1200;

/**
 * - "force-full": the OS is certain a full render is needed (first paint,
 *   spawned window, drag-drop, or no snapshot yet). Not negotiable.
 * - "prefer-incremental": a normal interaction on an already-rendered window.
 *   The OS *suggests* incremental, but the AI — which understands the semantics
 *   of the action — may upgrade to a full render when the change is structural.
 */
export type RenderMode = 'force-full' | 'prefer-incremental';

export interface AssembleInput {
  app: AppDescriptor;
  memory: AppMemory | null;
  recent: Interaction[];
  globalState: Record<string, unknown>;
  /** Current inner size of the window, so the AI lays out responsively. */
  windowSize?: { w: number; h: number };
  op?: AiOp;
  drag?: DragPayload;
  /** Seed instruction for an AI-spawned popup window. */
  seedPrompt?: string;
  firstRender: boolean;
  /** Decided by the backend BEFORE calling the AI — not left to the model. */
  renderMode: RenderMode;
  /** The data-vibeos-region ids present in the current snapshot (for incremental). */
  regionIds?: string[];
  /** OS-level user profile, injected so apps feel personalized. */
  userProfile?: string;
  /** prefs.stylePrompt — the user's preferred visual style for generated apps. */
  stylePrompt?: string;
  /** Active skin id — generated UI should match its era/material. */
  skin?: string;
  /** Prompt string the OS draws for terminals. */
  terminalPrompt?: string;
  /** [CURRENT UI] cap in chars; 0 (default) = uncapped full snapshot. */
  snapshotBudget?: number;
}

/**
 * Pre-decide the render mode before the AI runs. The OS only *forces* full when
 * it's structurally unavoidable; otherwise it nudges toward incremental but
 * lets the AI (which knows the action's intent) make the final call.
 */
export function decideRenderMode(input: {
  firstRender: boolean;
  hasSnapshot: boolean;
  isDrag: boolean;
  isSpawn: boolean;
  /** Browser navigation replaces the page wholesale — full mode streams it progressively. */
  isNavigate?: boolean;
}): RenderMode {
  if (
    input.firstRender ||
    input.isSpawn ||
    input.isDrag ||
    input.isNavigate ||
    !input.hasSnapshot
  ) {
    return 'force-full';
  }
  return 'prefer-incremental';
}

const SKIN_STYLE_HINTS: Record<string, string> = {
  devdock:
    'clean contemporary minimalism — soft rounded corners, generous spacing, quiet flat surfaces',
  xp: 'the classic Windows XP / 98 era — beveled 3D buttons, gray panels, chunky toolbars, dense compact controls, small utilitarian typography',
  aqua: 'the Mac OS X Aqua era — glossy gel buttons, pinstripe headers, rounded lozenge controls, brushed-metal moods',
  harness: 'neutral modern product UI that blends with a developer tool',
};

export function assemblePrompt(input: AssembleInput): string {
  const {
    app,
    memory,
    recent,
    globalState,
    windowSize,
    op,
    drag,
    seedPrompt,
    firstRender,
    renderMode,
    regionIds,
    userProfile,
    stylePrompt,
    skin,
    terminalPrompt,
  } = input;
  // Section order is cache-shaped: everything stable for the life of a window
  // goes first (identity, style guide, profile, skin), volatile state last, so
  // provider prefix caching keeps hitting across a window's whole session.
  const parts: string[] = [];

  if (userProfile?.trim()) {
    parts.push(
      `[USER PROFILE]\nWhat the user told us about themselves — tailor content to it (don't echo it verbatim):\n${truncate(userProfile.trim(), 800)}`,
    );
  }

  if (skin) {
    const hint =
      SKIN_STYLE_HINTS[skin] ??
      `an OS skin named "${skin}" — let its name inform the era and material of your layout`;
    parts.push(
      `[ACTIVE SKIN]\nThe OS is skinned as "${skin}": ${hint}. Match that era in LAYOUT and CONTROL STYLING (button shapes, borders, chrome density) while still using ONLY the design-system tokens for colors. The user's style preference below, if present, wins over this.`,
    );
  }

  if (stylePrompt?.trim()) {
    parts.push(
      `[USER STYLE PREFERENCE]\nThe user wants generated app UIs in this style — honor it within the design-system token rules:\n${truncate(stylePrompt.trim(), 400)}`,
    );
  }

  parts.push(
    `[APP]\nname: ${app.name}\nkind: ${app.kind}${app.presetId ? `\npreset: ${app.presetId}` : ''}` +
      (app.manifest.description ? `\nabout: ${app.manifest.description}` : ''),
  );

  const hint = presetHint(app.presetId);
  if (hint) parts.push(`[APP STYLE GUIDE]\n${hint}`);

  if (app.manifest.chrome) parts.push(chromeDirective(String(app.manifest.chrome), terminalPrompt));

  if (memory?.episodeSummary) {
    parts.push(`[EPISODE MEMORY]\n${truncate(memory.episodeSummary, SUMMARY_BUDGET)}`);
  }

  const gs: Record<string, unknown> = { ...compact(globalState) };
  if (windowSize) gs.windowSize = `${Math.round(windowSize.w)}x${Math.round(windowSize.h)}px`;
  parts.push(`[GLOBAL STATE]\n${JSON.stringify(gs, null, 0)}`);

  if (recent.length > 0) {
    const lines = recent
      .map(
        (r) =>
          `- ${r.opKind} ${summarizeOp(r.opPayload)}${r.resultSummary ? ` → ${r.resultSummary}` : ''}`,
      )
      .join('\n');
    parts.push(`[RECENT INTERACTIONS]\n${lines}`);
  }

  if (!firstRender && memory?.htmlSnapshot) {
    // Stateless ui-gen → send the FULL current UI every op (no cap by default).
    const budget = input.snapshotBudget ?? 0;
    const snap = budget > 0 ? truncateHtml(memory.htmlSnapshot, budget) : memory.htmlSnapshot;
    parts.push(`[CURRENT UI]\n${snap}`);
  }

  // What happened.
  let opLine: string;
  if (seedPrompt) {
    opLine = `This is a new window opened by the system, for the following purpose:\n${seedPrompt}`;
  } else if (firstRender) {
    opLine = `The user just launched this application.`;
  } else if (drag) {
    opLine = `The user dropped a ${drag.kind} (${drag.label ?? drag.ref}) onto this window. React to it.`;
  } else if (op) {
    opLine =
      `The user performed: ${op.kind}` +
      (op.action ? ` action="${op.action}"` : '') +
      // The clicked element's label/text — crucial for distinguishing controls
      // that share an action (e.g. which calculator key, which list row).
      (op.sel ? ` target="${op.sel}"` : '') +
      (op.value !== undefined ? ` value="${op.value}"` : '') +
      (op.dataset && Object.keys(op.dataset).length ? ` data=${JSON.stringify(op.dataset)}` : '') +
      (op.formData ? ` form=${JSON.stringify(op.formData)}` : '');
  } else {
    opLine = `Update the interface.`;
  }

  // Render-mode directive: the OS decides the BASELINE, the AI decides edge cases.
  const modeDirective =
    renderMode === 'force-full'
      ? `[RENDER MODE: FULL]\nReturn the COMPLETE window body in <vibeos-html>. Tag stable, updatable parts with data-vibeos-region="<stable-id>" so future changes can be patched incrementally. Do NOT return bare region fragments this time.`
      : `[RENDER MODE: INCREMENTAL PREFERRED]\nThe window is already rendered (see CURRENT UI${
          regionIds?.length ? `, regions: ${regionIds.join(', ')}` : ''
        }). DECIDE which fits this action:
- If the action changes only part(s) of the screen → return ONLY those data-vibeos-region elements (for accumulating regions like terminal/chat/list, include ALL their existing content plus the new part). This is the default — prefer it.
- If the action structurally replaces the screen (page navigation, switching to a totally different view) → return the FULL body instead.
Choose deliberately before you write: do not re-emit the whole window for a small change, and do not emit a fragment when the layout truly changed.`;

  parts.push(`[OPERATION]\n${opLine}\n\n${modeDirective}`);

  return parts.join('\n\n');
}

/** Per-app instructions when the OS provides a native chrome shell. */
function chromeDirective(chrome: string, terminalPrompt?: string): string {
  if (chrome === 'terminal' && terminalPrompt) {
    return `[NATIVE CHROME: terminal]\nThe OS draws the prompt line "${terminalPrompt}:~$ " and echoes the command itself. Never print a prompt, a hostname or the typed command.`;
  }
  if (chrome === 'browser') {
    return `[NATIVE CHROME: browser]
This window has a NATIVE address bar provided by the OS (back / forward / reload / URL field). You generate ONLY the page CONTENT below it — do NOT draw an address bar, toolbar, tabs, or any browser chrome yourself.
- Navigation arrives as an OPERATION with action="navigate" and the target in value/form (a URL or a search query). Render that page's content.
- A clicked link or anything that changes the page is also an OPERATION — render the new page.
- WHENEVER the shown page changes (navigation, clicked link, redirect, search) you MUST emit a chrome syscall so the address bar stays in sync:
\`\`\`vibeos-syscall
{ "calls": [ { "type": "chrome", "set": { "url": "https://example.com/path", "title": "Page title" } } ] }
\`\`\``;
  }
  return `[NATIVE CHROME: ${chrome}]\nThis window has a native shell provided by the OS; generate ONLY the inner content. Update the shell when the content's state changes via a chrome syscall: { "type":"chrome", "set": { ... } }.`;
}

function compact(state: Record<string, unknown>): Record<string, unknown> {
  // Keep the prompt small; drop anything large.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    const s = JSON.stringify(v);
    if (s && s.length < 800) out[k] = v;
  }
  return out;
}

function summarizeOp(payload: unknown): string {
  try {
    const s = JSON.stringify(payload);
    return s.length > 160 ? `${s.slice(0, 160)}…` : s;
  } catch {
    return '';
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}

/**
 * Truncate an HTML snapshot for context. Cuts at the last COMPLETE tag boundary
 * before `max` so the AI never sees a half-open tag, and marks the elision —
 * noting that unchanged regions are preserved automatically, so the model
 * shouldn't try to reconstruct the parts it can't see.
 */
function truncateHtml(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const lastClose = head.lastIndexOf('>');
  const cut = lastClose > max * 0.6 ? head.slice(0, lastClose + 1) : head;
  return `${cut}\n<!-- …[${s.length - cut.length} chars truncated; regions you don't see here are kept as-is — only re-emit a data-vibeos-region you actually change] -->`;
}
