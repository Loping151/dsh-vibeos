/** Native terminal shell. The prompt lives INLINE at the end of the scrollback —
 * exactly where a real terminal puts it — and typing/history/echo are handled
 * locally with no model round-trip. The model only ever returns scrollback
 * output for a submitted command. */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { wsClient } from '../../ws';
import { useWindowStore } from '../../stores/windowStore';
import { useAppStore } from '../../stores/appStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useT } from '../../lib/i18n';

const HISTORY_CAP = 200;
/** Per-window command history; module level so it survives remounts. */
const history = new Map<string, string[]>();

export function TerminalChrome({
  windowId,
  children,
}: {
  windowId: string;
  children: ReactNode;
}): ReactNode {
  const busy = useWindowStore((s) => !!s.busy[windowId]);
  const html = useWindowStore((s) => s.snapshots[windowId] ?? '');
  const appId = useWindowStore((s) => s.windows[windowId]?.appId ?? '');
  const app = useAppStore((s) => s.apps[appId]);
  const configured = useConnectionStore((s) => s.features?.terminalPrompt);
  const override = useSettingsStore((s) => s.settings?.prefs.terminalPrompt as string | undefined);
  const host = (override?.trim() || configured?.trim() || 'dev@vibeos').replace(/:~?\$?\s*$/, '');
  const t = useT();

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(-1);
  // The shell is usable once the model has printed its banner.
  const ready = html.trim().length > 0;

  /** The chrome owns the scroll, so the prompt trails the content naturally. */
  const scrollEl = (): HTMLElement | null => wrapRef.current;

  /** Copy the scrollback's type metrics so the caret line matches it exactly. */
  const placePrompt = () => {
    const prompt = promptRef.current;
    const region = wrapRef.current?.querySelector<HTMLElement>(
      '.ai-surface [data-vibeos-region], .ai-surface',
    );
    if (!prompt || !region) return;
    // Copy the typography of a REAL scrollback line (the region itself may
    // differ from the lines the user compares the caret row against).
    const sample = region.querySelector<HTMLElement>(':scope > div:not(.vibe-term-prompt)');
    const cs = getComputedStyle(sample ?? region);
    const box = getComputedStyle(region);
    prompt.style.font = cs.font || `${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
    prompt.style.letterSpacing = cs.letterSpacing;
    prompt.style.tabSize = cs.tabSize;
    prompt.style.color = cs.color;
    prompt.style.paddingLeft = box.paddingLeft;
    prompt.style.paddingRight = box.paddingRight;
    const scroll = wrapRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  };

  /** The prompt is ours; strip any prompt line the model still paints so the
   * caret never doubles up. */
  const stripModelPrompt = () => {
    const region = wrapRef.current?.querySelector<HTMLElement>(
      '.ai-surface [data-vibeos-region], .ai-surface',
    );
    if (!region) return;
    // Whitespace between the model's line divs becomes a blank line under
    // pre-wrap — real terminals do not double-space.
    for (const node of [...region.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim()) node.remove();
    }
    // Belt and braces: the host strips these, but old snapshots and mid-stream
    // frames can still carry a prompt line the OS already draws.
    const promptish = /^\s*[\w.-]+@[\w.-]+[^\n]{0,40}?[$#>]\s*$/;
    for (let i = region.children.length - 1; i >= 0; i--) {
      const el = region.children[i] as HTMLElement;
      if (el === promptRef.current) continue;
      if (el.dataset.vibeosEcho !== undefined) continue;
      const text = (el.textContent ?? '').replace(/\u00a0/g, ' ');
      // Fence markers and the summary sentence sometimes leak into the body.
      if (text.trim().startsWith('```')) {
        el.remove();
        continue;
      }
      if (text.trim() === '' || promptish.test(text)) {
        el.remove();
        continue;
      }
      break;
    }
  };

  useLayoutEffect(() => {
    stripModelPrompt();
    placePrompt();
  });

  // Clicking empty terminal space focuses the caret, like a real emulator.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
      setTimeout(() => {
        if (!getSelection()?.toString()) inputRef.current?.focus();
      }, 0);
    };
    el.addEventListener('mouseup', onUp);
    return () => el.removeEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    if (!busy && ready) inputRef.current?.focus();
  }, [busy, ready]);

  /** Commit a line into the model's scrollback before the model replies. */
  const appendLocalLine = (label: string, text: string) => {
    const region = wrapRef.current?.querySelector<HTMLElement>(
      '.ai-surface [data-vibeos-region], .ai-surface',
    );
    if (!region) return;
    const line = document.createElement('div');
    line.dataset.vibeosEcho = '';
    const tag = document.createElement('span');
    tag.style.color = 'var(--run)';
    tag.textContent = label;
    line.append(tag, text);
    if (promptRef.current?.parentElement === region) region.insertBefore(line, promptRef.current);
    else region.appendChild(line);
  };

  const submit = () => {
    const cmd = value.trim();
    if (!cmd || busy || !ready) return;
    const list = history.get(windowId) ?? [];
    history.set(windowId, [...list.filter((c) => c !== cmd), cmd].slice(-HISTORY_CAP));
    setCursor(-1);
    setValue('');
    // Local echo: the line is committed before the model has said anything.
    // The host commits the echo line (durable, and it survives the append
    // patch); showing a local copy first would duplicate it for a blink.
    useWindowStore.getState().setBusy(windowId, true);
    wsClient.send('c2s.op', {
      windowId,
      op: { kind: 'submit', action: 'run', value: cmd, formData: { cmd } },
    });
    setTimeout(placePrompt, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const list = history.get(windowId) ?? [];
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!list.length) return;
      const next = cursor < 0 ? list.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setValue(list[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cursor < 0) return;
      const next = cursor + 1;
      if (next >= list.length) {
        setCursor(-1);
        setValue('');
      } else {
        setCursor(next);
        setValue(list[next] ?? '');
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      useWindowStore.getState().setBusy(windowId, true);
      wsClient.send('c2s.op', {
        windowId,
        op: { kind: 'submit', action: 'run', value: 'clear', formData: { cmd: 'clear' } },
      });
    } else if (e.ctrlKey && e.key === 'c' && !getSelection()?.toString()) {
      e.preventDefault();
      appendLocalLine(`${host}:~$ `, `${value}^C`);
      setValue('');
      setCursor(-1);
    }
  };

  // Re-place the prompt whenever new scrollback lands.
  useEffect(() => {
    stripModelPrompt();
    placePrompt();
  }, [html, busy]);

  return (
    <div ref={wrapRef} className="vibe-term h-full w-full overflow-auto">
      {children}
      <div
        ref={promptRef}
        className="vibe-term-prompt flex items-center gap-0"
        data-running={busy ? 'true' : undefined}
        onMouseDown={(e) => {
          e.stopPropagation();
          inputRef.current?.focus();
        }}
      >
        {/* A real shell prints the next prompt only after the command returns. */}
        <span className="shrink-0 select-none whitespace-pre text-[color:var(--run)]">
          {ready && !busy ? `${host}:~$ ` : ''}
        </span>
        {!ready && (
          <span className="select-none text-[color:var(--muted-foreground)]">
            {t('boot.restoring')}
          </span>
        )}
        {ready && busy && (
          <span
            className="inline-block h-[1em] w-[0.55em] select-none bg-[color:var(--foreground)] align-middle"
            style={{ animation: 'vibe-blink 1.1s step-end infinite' }}
            aria-hidden
          />
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label="terminal input"
          disabled={busy || !ready}
          className={
            'min-w-0 flex-1 bg-transparent p-0 outline-none ' + (busy ? 'invisible w-0 flex-none' : '')
          }
          style={{
            font: 'inherit',
            color: 'inherit',
            letterSpacing: 'inherit',
            background: 'transparent',
            border: 'none',
          }}
        />
      </div>
    </div>
  );
}
