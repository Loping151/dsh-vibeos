/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/window/BrowserChrome.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): lucide icons become the inline-SVG set. Original license: MIT. */

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { wsClient } from '../../ws';
import { useChromeStore } from '../../stores/chromeStore';
import { useWindowStore } from '../../stores/windowStore';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { ArrowLeft, ArrowRight, RotateCw } from '../../icons/uiIcons';

/**
 * Native browser chrome: address bar + back/forward/reload wrapping the AI page.
 * Forward (bar -> AI) sends a "navigate" op; reverse (AI -> bar) arrives through
 * the chrome syscall and updates the URL here.
 */
export function BrowserChrome({
  windowId,
  children,
}: {
  windowId: string;
  children: ReactNode;
}): ReactNode {
  const t = useT();
  const url = useChromeStore((s) => s.states[windowId]?.url ?? '');
  const [input, setInput] = useState(url);
  const hist = useRef<{ stack: string[]; idx: number }>({ stack: [], idx: -1 });
  const skipPush = useRef(false);
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => setInput(url), [url]);

  // Maintain history as the URL changes — from a nav here OR from the AI — but
  // skip the change caused by a back/forward step itself.
  useEffect(() => {
    if (!url) return;
    if (skipPush.current) {
      skipPush.current = false;
      return;
    }
    const h = hist.current;
    if (h.stack[h.idx] === url) return;
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(url);
    h.idx = h.stack.length - 1;
    force();
  }, [url]);

  const navigate = (target: string) => {
    if (useWindowStore.getState().busy[windowId]) return;
    const u = target.trim();
    if (!u) return;
    useChromeStore.getState().set(windowId, { url: u });
    useWindowStore.getState().setBusy(windowId, true);
    wsClient.send('c2s.op', {
      windowId,
      op: { kind: 'submit', action: 'navigate', value: u, formData: { url: u } },
    });
  };

  const step = (dir: -1 | 1) => {
    const h = hist.current;
    const next = h.idx + dir;
    if (next < 0 || next >= h.stack.length) return;
    h.idx = next;
    skipPush.current = true;
    force();
    navigate(h.stack[next]!);
  };

  const canBack = hist.current.idx > 0;
  const canFwd = hist.current.idx < hist.current.stack.length - 1;
  const btn =
    'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 disabled:opacity-40';

  return (
    <div className="flex h-full w-full flex-col">
      <div className="vibe-browser-bar">
        <button
          onClick={() => step(-1)}
          disabled={!canBack}
          title={t('browser.back')}
          className={btn}
        >
          <ArrowLeft size={16} />
        </button>
        <button onClick={() => step(1)} disabled={!canFwd} title={t('browser.forward')} className={btn}>
          <ArrowRight size={16} />
        </button>
        <button
          onClick={() => url && navigate(url)}
          title={t('browser.reload')}
          className={cn(btn, 'mr-1')}
        >
          <RotateCw size={14} />
        </button>
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(input);
            (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('browser.address')}
            spellCheck={false}
            className="vibe-browser-url"
          />
        </form>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}
