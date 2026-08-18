/** Sandboxed applet surface: a full HTML document with REAL JavaScript, run in
 * an `allow-scripts`-only iframe. Without `allow-same-origin` the document sits
 * in an opaque origin — no access to the host DOM, cookies or storage — so the
 * only channel back is postMessage, validated here. */

import { useEffect, useRef, type ReactNode } from 'react';
import { wsClient } from '../../ws';
import { useWindowStore } from '../../stores/windowStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useT } from '../../lib/i18n';
import { openContextMenu } from '../contextmenu/ContextMenu';
import { appContentMenu } from '../contextmenu/menus';

interface Props {
  windowId: string;
  /** Document body/markup produced by the model. */
  applet: string;
}

/** Injected into every applet: the tiny `vibeos` API and the op bridge. */
const BRIDGE = `<script>
(() => {
  // An opaque origin THROWS on localStorage/sessionStorage/cookies, which kills
  // any applet that touches them (high scores, settings). Shim them in memory
  // before the applet's own code runs.
  const memStore = () => {
    const map = new Map();
    return {
      getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
      setItem: (k, v) => void map.set(String(k), String(v)),
      removeItem: (k) => void map.delete(String(k)),
      clear: () => map.clear(),
      key: (i) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    };
  };
  for (const name of ['localStorage', 'sessionStorage']) {
    let usable = false;
    try {
      usable = !!window[name] && (window[name].setItem('__v', '1'), true);
    } catch { usable = false; }
    if (!usable) {
      try {
        Object.defineProperty(window, name, { value: memStore(), configurable: true });
      } catch { /* nothing else to try */ }
    }
  }
  const post = (type, payload) => parent.postMessage({ __vibeos: 1, type, payload }, '*');
  addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.__vibeos !== 1 || m.type !== 'tokens') return;
    let el = document.getElementById('vibeos-tokens');
    if (!el) {
      el = document.createElement('style');
      el.id = 'vibeos-tokens';
      document.head.appendChild(el);
    }
    el.textContent = m.payload.css;
  });
  window.vibeos = {
    op: (action, data) => post('op', { action, data }),
    notify: (title, body) => post('notify', { title, body }),
    setTitle: (title) => post('title', { title }),
    close: () => post('close', {}),
  };
  addEventListener('error', (e) => post('error', { message: String(e.message) }));
  addEventListener('pointerdown', () => window.focus());
  addEventListener('load', () => window.focus());
  // The OS owns the context menu; the browser's would break the illusion.
  addEventListener('contextmenu', (e) => {
    e.preventDefault();
    post('contextmenu', { x: e.clientX, y: e.clientY });
  });
})();
</script>`;

const FRAME_CSS = `<style>
  html, body { margin: 0; height: 100%; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
</style>`;

function buildDocument(applet: string, tokens: string): string {
  const hasHtmlTag = /<html[\s>]/i.test(applet);
  if (hasHtmlTag) return applet.replace(/<head[^>]*>/i, (m) => `${m}${tokens}${FRAME_CSS}${BRIDGE}`);
  return `<!doctype html><html><head><meta charset="utf-8">${tokens}${FRAME_CSS}${BRIDGE}</head><body>${applet}</body></html>`;
}

/** Applied before the live values, so a frame that mounts before the desktop
 * has painted is still legible instead of blank white. */
const FALLBACK_TOKENS =
  '--background:#101014;--foreground:#e9eaee;--card:#191a20;--card-foreground:#e9eaee;' +
  '--muted:#22242b;--muted-foreground:#a3a7b3;--border:#2c2f38;--primary:#3d7be0;' +
  '--primary-foreground:#fff;--accent:#242833;--accent-foreground:#e9eaee;--brand:#5b9dff;' +
  '--destructive:#ff5470;--run:#57e0a0;--warn:#ffc857;--radius:0.6rem;';

/** Copy the live design tokens in so applets match the active skin. */
function tokenStyle(): string {
  const root = document.getElementById('vibeos-root');
  if (!root) return `<style id="vibeos-tokens">:root{${FALLBACK_TOKENS}} body{background:var(--background);color:var(--foreground);}</style>`;
  const cs = getComputedStyle(root);
  const names = [
    'background', 'foreground', 'card', 'card-foreground', 'muted', 'muted-foreground',
    'border', 'primary', 'primary-foreground', 'accent', 'accent-foreground', 'brand',
    'destructive', 'run', 'warn', 'radius', 'font-sans',
  ];
  const decls = names
    .map((n) => `--${n}: ${cs.getPropertyValue(`--${n}`).trim()};`)
    .filter((d) => !d.endsWith(': ;'))
    .join('');
  return `<style id="vibeos-tokens">:root{${FALLBACK_TOKENS}${decls}} body{background:var(--background);color:var(--foreground);}</style>`;
}

export function AppletSurface({ windowId, applet }: Props): ReactNode {
  const ref = useRef<HTMLIFrameElement>(null);
  const translate = useT();
  const win = useWindowStore((s) => s.windows[windowId]);
  const focused = useWindowStore((s) => !!s.windows[windowId]?.focused);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const frame = ref.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const msg = e.data as { __vibeos?: number; type?: string; payload?: Record<string, unknown> };
      if (msg?.__vibeos !== 1 || typeof msg.type !== 'string') return;
      const p = msg.payload ?? {};
      switch (msg.type) {
        case 'op':
          useWindowStore.getState().setBusy(windowId, true);
          wsClient.send('c2s.op', {
            windowId,
            op: {
              kind: 'click',
              action: String(p.action ?? 'applet'),
              dataset: { data: JSON.stringify(p.data ?? null).slice(0, 2000) },
            },
          });
          break;
        case 'notify':
          wsClient.send('c2s.op', {
            windowId,
            op: {
              kind: 'click',
              action: 'applet-notify',
              value: String(p.title ?? '').slice(0, 200),
              dataset: { body: String(p.body ?? '').slice(0, 400) },
            },
          });
          break;
        case 'error':
          console.warn('[vibeos applet]', p.message);
          break;
        case 'contextmenu': {
          const rect = frame.getBoundingClientRect();
          openContextMenu(
            {
              clientX: rect.left + Number(p.x ?? 0),
              clientY: rect.top + Number(p.y ?? 0),
              preventDefault() {},
              stopPropagation() {},
            } as unknown as React.MouseEvent,
            appContentMenu({ t: translate, win, native: false }),
          );
          break;
        }
        case 'close':
          wsClient.send('c2s.window.close', { windowId });
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [windowId, translate, win]);

  // Skin/theme changes must reach a running applet without reloading it.
  const skinKey = useSettingsStore((s) => `${s.settings?.skin ?? ''}|${s.settings?.theme ?? ''}`);
  useEffect(() => {
    const send = () => {
      const css = tokenStyle().replace(/^<style[^>]*>/, '').replace(/<\/style>$/, '');
      ref.current?.contentWindow?.postMessage({ __vibeos: 1, type: 'tokens', payload: { css } }, '*');
    };
    const id = setTimeout(send, 60);
    return () => clearTimeout(id);
  }, [skinKey]);

  // A sandboxed frame only receives key events while focused; the window being
  // focused is the user's intent, so hand the keyboard over.
  useEffect(() => {
    if (!focused) return;
    const id = setTimeout(() => ref.current?.contentWindow?.focus(), 50);
    return () => clearTimeout(id);
  }, [focused]);

  return (
    <iframe
      ref={ref}
      onMouseEnter={() => ref.current?.contentWindow?.focus()}
      title="applet"
      // No allow-same-origin: the applet cannot reach the host document.
      sandbox="allow-scripts allow-pointer-lock allow-forms"
      srcDoc={buildDocument(applet, tokenStyle())}
      className="h-full w-full border-0 bg-background"
    />
  );
}
