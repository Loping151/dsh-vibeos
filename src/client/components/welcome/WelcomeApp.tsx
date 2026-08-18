/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/welcome/WelcomeApp.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): measurements are taken from #vibeos-root (the desktop may not
 * be the whole page) and icons come from the inline set. Original license: MIT. */

import { useLayoutEffect, useRef, type FC } from 'react';
import { useWindowStore } from '../../stores/windowStore';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import { requestSpotlight } from '../../lib/uiEvents';
import { getVibeosRoot } from '../../lib/utils';
import { NAME_ICONS } from '../../icons/appIcons';
import { ArrowRight, ChevronRight, type IconProps } from '../../icons/uiIcons';

/** Fixed content column width; the height fits the content (see below). */
const CONTENT_WIDTH = 460;
/** Titlebar (h-9 = 36px) + the window's top/bottom borders (2px). */
const CHROME_H = 38;

// Each example carries its own fitting icon — showcases that the AI generates
// real, visually rich apps (not toy calculators / to-do lists).
const EXAMPLES: { key: string; Icon: FC<IconProps> }[] = [
  { key: 'welcome.example.weather', Icon: NAME_ICONS['cloud-sun']! },
  { key: 'welcome.example.game', Icon: NAME_ICONS['gamepad']! },
  { key: 'welcome.example.music', Icon: NAME_ICONS['music']! },
];

const Rocket = NAME_ICONS['rocket']!;

/**
 * Native Welcome app — the cold-start landing. A real VibeOS window (opened on
 * first boot, reopenable from the start menu), so this renders only the body;
 * the window chrome provides the titlebar and close button. On open it centers
 * itself and sizes the window to fit its content.
 */
export function WelcomeApp({ windowId }: { windowId: string }) {
  const t = useT();
  const bodyRef = useRef<HTMLDivElement>(null);

  // Center in the desktop container and fit the window to its content the moment
  // it opens (useLayoutEffect runs before paint, so there's no resize flash).
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const root = getVibeosRoot();
    const bounds = root?.getBoundingClientRect();
    const vw = bounds?.width ?? window.innerWidth;
    const vh = bounds?.height ?? window.innerHeight;
    const w = CONTENT_WIDTH;
    const h = Math.ceil(el.offsetHeight) + CHROME_H;
    const taskbarH = root?.querySelector('.vibe-taskbar')?.getBoundingClientRect().height ?? 44;
    const x = Math.max(8, Math.round((vw - w) / 2));
    const y = Math.max(8, Math.round((vh - taskbarH - h) / 2));
    const cur = useWindowStore.getState().windows[windowId];
    if (cur) useWindowStore.getState().upsert({ ...cur, rect: { x, y, w, h } });
    wsClient.send('c2s.window.move', { windowId, x, y, w, h });
  }, [windowId]);

  return (
    <div ref={bodyRef} className="flex flex-col bg-background px-7 py-8 text-foreground">
      <div className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <Rocket className="size-5" />
        </span>
        Vibe<span className="text-muted-foreground">OS</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t('welcome.subtitle')}</p>

      <div className="mt-7 text-[11px] font-medium text-muted-foreground">
        {t('welcome.tryThese')}
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {EXAMPLES.map(({ key, Icon }) => {
          const text = t(key);
          return (
            <button
              key={key}
              onClick={() => requestSpotlight(`> ${text}`)}
              className="group flex items-center gap-2.5 rounded-lg border bg-card px-3 py-3 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
                <Icon className="size-3.5" />
              </span>
              <span className="flex-1 truncate">{text}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>

      <button
        onClick={() => requestSpotlight()}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t('welcome.start')}
        <ArrowRight className="size-4" />
      </button>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">{t('welcome.hint')}</p>
    </div>
  );
}
