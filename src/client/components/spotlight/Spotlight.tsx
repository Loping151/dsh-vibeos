/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/spotlight/Spotlight.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): motion becomes CSS presence transitions and the seeded
 * query lives in a module store (the overridable prop set is open/onClose only). Original license: MIT. */

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { ulid, type AppSearchResult } from '../../../shared/index';
import { wsClient } from '../../ws';
import { useConnectionStore } from '../../stores/connectionStore';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { overlayStyle, popoverStyle, usePresence, useReducedMotion } from '../../lib/anim';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';
import { AppIcon } from '../AppIcon';
import {
  AppWindow,
  ChevronRight,
  LayoutGrid,
  Loader2,
  Search,
  Sparkles,
} from '../../icons/uiIcons';

const DEBOUNCE_FALLBACK_MS = 1000;

interface SpotlightState {
  open: boolean;
  /** Seeded on open (e.g. "> make a calculator" from Welcome). */
  query: string;
  openWith: (query?: string) => void;
  toggle: () => void;
  close: () => void;
}

/** Shared with the desktop (keyboard shortcut + the open-spotlight ui event). */
export const useSpotlightStore = create<SpotlightState>((set) => ({
  open: false,
  query: '',
  openWith: (query = '') => set({ open: true, query }),
  toggle: () => set((s) => ({ open: !s.open, query: '' })),
  close: () => set({ open: false }),
}));

/** Mac-Spotlight-style AI app search; a leading ">" switches to command mode. */
function DefaultSpotlight({ open, onClose }: ComponentProps['spotlight']): ReactNode {
  const initialQuery = useSpotlightStore((s) => s.query);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AppSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef<string>('');
  const cmdReqId = useRef<string>('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceMs =
    useConnectionStore((s) => s.features?.searchDebounceMs) ?? DEBOUNCE_FALLBACK_MS;
  const t = useT();
  const reduced = useReducedMotion();
  const { mounted, entered } = usePresence(open);

  const isCommand = query.trimStart().startsWith('>');
  const commandText = query.replace(/^\s*>\s*/, '');

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setResults([]);
    setActive(0);
    setRunning(false);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open, initialQuery]);

  // Command finished: stop the spinner and close on success (the AI's own notify
  // syscall surfaces the result).
  useEffect(
    () =>
      wsClient.on('s2c.command.result', (p) => {
        if (p.requestId !== cmdReqId.current) return;
        setRunning(false);
        if (!p.error) onClose();
      }),
    [onClose],
  );

  // Only results matching the newest request are accepted.
  useEffect(
    () =>
      wsClient.on('s2c.app.searchResults', (p) => {
        if (p.requestId !== reqId.current) return;
        // Stable sort by kind: apps first, then widgets (model order kept within).
        setResults(
          [...p.results].sort((a, b) => (a.kind === 'widget' ? 1 : 0) - (b.kind === 'widget' ? 1 : 0)),
        );
        setActive(0);
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (isCommand) {
      setResults([]);
      setLoading(false);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(() => {
      const id = ulid();
      reqId.current = id;
      wsClient.send('c2s.app.search', { query: q, requestId: id });
    }, debounceMs);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, open, isCommand, debounceMs]);

  if (!mounted) return null;

  const launch = (r: AppSearchResult, asWidget = false) => {
    wsClient.send('c2s.app.launch', {
      name: r.name,
      description: r.description,
      icon: r.icon,
      widget: asWidget,
    });
    onClose();
  };

  const runCommandPalette = () => {
    const text = commandText.trim();
    if (!text || running) return;
    const id = ulid();
    cmdReqId.current = id;
    setRunning(true);
    wsClient.send('c2s.command.run', { text, requestId: id });
  };

  /** Run the query immediately (Enter), bypassing the idle debounce. */
  const searchNow = () => {
    const q = query.trim();
    if (q.length < 2) return;
    if (debounce.current) clearTimeout(debounce.current);
    const id = ulid();
    reqId.current = id;
    setLoading(true);
    wsClient.send('c2s.app.search', { query: q, requestId: id });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose();
    if (isCommand) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runCommandPalette();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      // Each result launches in the form the model assigned it — no toggling.
      if (r) return launch(r, r.kind === 'widget');
      // Nothing to launch yet: Enter means "search now", skipping the idle wait.
      searchNow();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/30 pt-[18vh] backdrop-blur-sm"
      style={overlayStyle(entered)}
      onPointerDown={onClose}
    >
      <div
        className="w-[min(620px,92vw)] overflow-hidden rounded-2xl border bg-popover/95 shadow-2xl sheen"
        style={popoverStyle(entered, reduced)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4">
          {loading || running ? (
            <Loader2 size={20} className="shrink-0 animate-spin text-muted-foreground" />
          ) : isCommand ? (
            <ChevronRight size={20} className="shrink-0 text-brand" />
          ) : (
            <Search size={20} className="shrink-0 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('spotlight.placeholder')}
            className="h-14 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
          />
        </div>

        {isCommand && (
          <div className="border-t p-1.5">
            <button
              onClick={runCommandPalette}
              disabled={!commandText.trim() || running}
              className="flex w-full items-center gap-3 rounded-lg bg-accent px-3 py-2.5 text-left disabled:opacity-60"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
                {running ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {running ? t('spotlight.cmdRunning') : t('spotlight.cmdRun')}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {commandText.trim() || t('spotlight.cmdHint')}
                </span>
              </span>
              <kbd className="rounded border bg-muted px-1 text-[10px] text-muted-foreground">↵</kbd>
            </button>
          </div>
        )}

        {!isCommand && results.length > 0 && (
          <div className="max-h-80 overflow-auto border-t p-1.5">
            {results.map((r, i) => {
              const isWidget = r.kind === 'widget';
              const showHeader = i === 0 || results[i - 1]?.kind !== r.kind;
              return (
                <Fragment key={`${r.name}-${i}`}>
                  {showHeader && (
                    <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5 text-[11px] font-medium text-muted-foreground">
                      {isWidget ? <LayoutGrid size={12} /> : <AppWindow size={12} />}
                      {isWidget ? t('spotlight.kindWidget') : t('spotlight.kindApp')}
                    </div>
                  )}
                  <button
                    onPointerEnter={() => setActive(i)}
                    onClick={() => launch(r, isWidget)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      i === active ? 'bg-accent' : 'hover:bg-accent/60',
                    )}
                  >
                    <AppIcon name={r.icon} label={r.name} className="size-6" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.name}</span>
                      {r.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.description}
                        </span>
                      )}
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        )}

        {!isCommand && query.trim().length >= 2 && !loading && results.length === 0 && (
          <div className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
            {t('spotlight.noResults')}
          </div>
        )}

        {!isCommand && (
          <div className="flex items-center gap-1.5 border-t px-4 py-1.5 text-[10px] text-muted-foreground">
            <kbd className="rounded border bg-muted px-1">&gt;</kbd>
            {t('spotlight.cmdMode')}
          </div>
        )}
      </div>
    </div>
  );
}

registerComponent('spotlight', DefaultSpotlight);

export function Spotlight(props: { open: boolean; onClose: () => void }): ReactNode {
  return <Overridable component="spotlight" props={props} />;
}
