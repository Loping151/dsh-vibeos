/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/window/AiHtmlSurface.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): images are same-origin (/vibeos/img), so the API_BASE
 * rewrite is dropped; every other behavior is contractual and unchanged. Original license: MIT. */

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { AiOp, DragPayload } from '../../../shared/index';
import { sanitizeAiHtml } from '../../lib/sanitize';
import { wsClient } from '../../ws';
import { useDelegatedEvents } from '../../hooks/useDelegatedEvents';
import { useWindowStore } from '../../stores/windowStore';

interface Props {
  windowId: string;
  html: string;
}

/** Per-window scroll position; module level so it survives innerHTML rebuilds AND remounts. */
const scrollMemory = new Map<string, number>();

const IMG_PREFIX = '/vibeos/img/';

/** Identify an input across re-renders (name -> action -> placeholder -> aria-label). */
function inputKey(el: HTMLInputElement | HTMLTextAreaElement): string {
  return (
    el.getAttribute('name') ??
    el.dataset.vibeosAction ??
    el.getAttribute('placeholder') ??
    el.getAttribute('aria-label') ??
    ''
  );
}

/**
 * Renders sanitized AI-generated HTML and routes all interactions back to the
 * host as operations. The AI never gets to run code in the shell.
 */
/** The last scrollable accumulate region — where a submitted command echoes. */
function scrollbackRegion(root: HTMLElement): HTMLElement | null {
  let candidate: HTMLElement | null = null;
  for (const region of root.querySelectorAll<HTMLElement>('[data-vibeos-region]')) {
    const style = getComputedStyle(region);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') candidate = region;
  }
  return candidate;
}

export function AiHtmlSurface({ windowId, html }: Props): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const busy = useWindowStore((s) => s.busy[windowId]);

  const preserved = useRef<{ key: string; value: string; caret: number | null } | null>(null);

  const onOp = useCallback(
    (op: AiOp) => {
      // One in-flight generation per window: impatient re-clicks are dropped,
      // not queued (the busy cursor says why).
      if (useWindowStore.getState().busy[windowId]) return;
      // Snapshot the active input before we (likely) re-render.
      const active = document.activeElement as HTMLElement | null;
      if (active && ref.current?.contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName)) {
        const inp = active as HTMLInputElement;
        const key = inputKey(inp);
        if (key) {
          preserved.current = {
            key,
            value: inp.value,
            caret: typeof inp.selectionStart === 'number' ? inp.selectionStart : null,
          };
        }
      }
      useWindowStore.getState().setBusy(windowId, true);
      wsClient.send('c2s.op', { windowId, op });
    },
    [windowId],
  );

  useDelegatedEvents(ref, onOp);

  // Submitted forms clear their inputs; the pre-op snapshot must not resurrect
  // the submitted text after the next inject. If the app has a scrollback-style
  // region, echo the submitted text into it immediately (terminal semantics) —
  // the model's authoritative render replaces it seconds later.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onSubmitted = (e: Event) => {
      preserved.current = null;
      const value = (e as CustomEvent<{ value?: string }>).detail?.value?.trim();
      if (!value) return;
      const target = scrollbackRegion(el);
      if (!target) return;
      const line = document.createElement('div');
      line.dataset.vibeosEcho = '';
      line.style.opacity = '0.75';
      line.textContent = value;
      target.appendChild(line);
      target.scrollTop = target.scrollHeight;
    };
    el.addEventListener('vibeos:submitted', onSubmitted);
    return () => el.removeEventListener('vibeos:submitted', onSubmitted);
  }, []);

  // Inject ONLY when the html actually changes — never on a plain re-render
  // (drag / focus / z-order), which would reset scroll and stutter the drag.
  // Scrollable regions that were pinned to the bottom (terminal scrollback)
  // stay pinned after the new content lands; regions scrolled up keep their
  // position.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pinned = new Set<string>();
    const positions = new Map<string, number>();
    const scrollers = (root: HTMLElement): Array<[string, HTMLElement]> => {
      const out: Array<[string, HTMLElement]> = [['__root__', root as HTMLElement]];
      for (const region of root.querySelectorAll<HTMLElement>('[data-vibeos-region]')) {
        if (region.dataset.vibeosRegion) out.push([region.dataset.vibeosRegion, region]);
      }
      for (const inner of root.querySelectorAll<HTMLElement>('div')) {
        if (inner.scrollTop > 0 && !inner.dataset.vibeosRegion) {
          const id = '__sc_' + Array.from(root.querySelectorAll<HTMLElement>('div')).indexOf(inner);
          out.push([id, inner]);
        }
      }
      return out;
    };
    const before = scrollers(el);
    for (const [id, node] of before) {
      if (node.scrollHeight <= node.clientHeight) continue;
      if (node.scrollHeight - node.scrollTop - node.clientHeight < 48) pinned.add(id);
      else if (node.scrollTop > 0) positions.set(id, node.scrollTop);
    }
    el.innerHTML = html ? sanitizeAiHtml(html) : '';
    for (const [id, node] of scrollers(el)) {
      if (pinned.has(id)) node.scrollTop = node.scrollHeight;
      else if (positions.has(id)) node.scrollTop = positions.get(id)!;
    }
  }, [html]);

  // Generated images may 404 until the file lands; retry with a cache-busting
  // query instead of leaving a broken image. `error` does not bubble -> capture.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onErr = (e: Event) => {
      const img = e.target as HTMLImageElement;
      if (img?.tagName !== 'IMG' || !img.src.includes(IMG_PREFIX)) return;
      const n = Number(img.dataset.vibeRetry ?? '0');
      if (n >= 6) return;
      img.dataset.vibeRetry = String(n + 1);
      const base = img.src.replace(/[?&]r=\d+$/, '');
      const sep = base.includes('?') ? '&' : '?';
      setTimeout(
        () => {
          img.src = `${base}${sep}r=${n + 1}`;
        },
        1000 + n * 1500,
      );
    };
    el.addEventListener('error', onErr, true);
    return () => el.removeEventListener('error', onErr, true);
  }, []);

  const onScroll = useCallback(() => {
    if (ref.current) scrollMemory.set(windowId, ref.current.scrollTop);
  }, [windowId]);

  // After every render, undo a scroll reset caused by re-injection (guarded so
  // it never fights live scrolling). Deliberately not cleared on unmount.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = scrollMemory.get(windowId);
    if (saved && el.scrollTop === 0) el.scrollTop = saved;
  });

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dt = e.dataTransfer;
      let source: DragPayload | null = null;
      const raw = dt.getData('application/x-vibeos-drag');
      if (raw) {
        try {
          source = JSON.parse(raw) as DragPayload;
        } catch {
          /* ignore */
        }
      }
      if (!source && dt.files.length) {
        const f = dt.files[0]!;
        source = { kind: 'file', ref: f.name, label: f.name };
      }
      if (!source) {
        const val = (dt.getData('text/uri-list') || dt.getData('text/plain')).trim();
        if (val) source = { kind: 'text', ref: val, label: val.slice(0, 80) };
      }
      if (!source?.ref) return;
      useWindowStore.getState().setBusy(windowId, true);
      wsClient.send('c2s.op.dragdrop', { windowId, source, target: { windowId } });
    },
    [windowId],
  );

  // Restore a preserved input value once the new markup left its field blank.
  useLayoutEffect(() => {
    const p = preserved.current;
    if (!p || !ref.current) return;
    preserved.current = null;
    const fields = ref.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea',
    );
    for (const f of fields) {
      if (inputKey(f) === p.key && !f.value) {
        f.value = p.value;
        if (p.caret != null && 'setSelectionRange' in f) {
          try {
            f.focus();
            f.setSelectionRange(p.caret, p.caret);
          } catch {
            /* ignore */
          }
        }
        break;
      }
    }
  }, [html]);

  return (
    <div className="relative h-full w-full overflow-hidden" onDragOver={onDragOver} onDrop={onDrop}>
      {busy && <ProgressBar />}

      {/* Mounted UNCONDITIONALLY: gating it on `html` would leave the delegation
          effect bound to nothing, so a brand-new window would ignore every click. */}
      <div
        ref={ref}
        onScroll={onScroll}
        data-busy={busy ? 'true' : undefined}
        className="ai-surface h-full w-full overflow-auto"
      />
    </div>
  );
}

/** Indeterminate top progress bar, like a real OS/browser loading indicator. */
function ProgressBar(): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-foreground/10">
      <div className="vibeos-progress h-full w-2/5 bg-brand" />
    </div>
  );
}
