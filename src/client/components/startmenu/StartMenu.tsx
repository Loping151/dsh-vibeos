/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/startmenu/StartMenu.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): motion becomes a CSS presence transition, app search goes
 * through the container-scoped ui event, and a classic-mode entry is appended. Original license: MIT. */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { AppDescriptor } from '../../../shared/index';
import { useAppStore } from '../../stores/appStore';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import { requestSpotlight } from '../../lib/uiEvents';
import { getVibeosRoot } from '../../lib/utils';
import { popoverStyle, usePresence, useReducedMotion } from '../../lib/anim';
import { useAnchoredPopover } from '../../hooks/useAnchoredPopover';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';
import { AppIcon } from '../AppIcon';
import { requestSystemReset } from '../desktop/ResetDialog';
import { Power, RefreshCw, Search } from '../../icons/uiIcons';

const TRIGGER = '[data-popover-trigger="start"]';

function DefaultStartMenu({ open, onClose }: ComponentProps['start-menu']): ReactNode {
  const appMap = useAppStore((s) => s.apps);
  const apps = useMemo(
    () => Object.values(appMap).filter((a) => a.id !== '__transient__'),
    [appMap],
  );
  const system = useMemo(() => apps.filter((a) => a.kind === 'preset'), [apps]);
  const generated = useMemo(() => apps.filter((a) => a.kind === 'virtual'), [apps]);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  const reduced = useReducedMotion();
  const { mounted, entered } = usePresence(open);
  const anchor = useAnchoredPopover(open, TRIGGER, 'left', 320);

  useEffect(() => {
    if (!open) return;
    const root = getVibeosRoot();
    const onDown = (e: Event) => {
      // Ignore the trigger so clicking it toggles closed (not close-then-reopen).
      if ((e.target as HTMLElement)?.closest?.(TRIGGER)) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    root?.addEventListener('pointerdown', onDown);
    return () => root?.removeEventListener('pointerdown', onDown);
  }, [open, onClose]);

  if (!mounted) return null;

  const launch = (appId: string) => {
    wsClient.send('c2s.window.open', { appId });
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{ ...anchor, ...popoverStyle(entered, reduced), transformOrigin: 'bottom left' }}
      className="vibe-startmenu"
    >
      <button
        onClick={() => {
          onClose();
          requestSpotlight();
        }}
        className="vibe-startsearch"
      >
        <Search size={16} className="text-muted-foreground" />
        <span className="flex-1 text-sm">{t('startmenu.appSearch')}</span>
        <span className="text-[10px] text-muted-foreground">{t('startmenu.appSearchHint')}</span>
      </button>

      <AppSection title={t('startmenu.system')} apps={system} onLaunch={launch} />
      {generated.length > 0 && (
        <AppSection title={t('startmenu.generated')} apps={generated} onLaunch={launch} />
      )}

      <div className="mt-2 flex gap-1">
        <button
          onClick={() => {
            onClose();
            wsClient.send('c2s.settings.update', { partial: { prefs: { classicMode: true } } });
          }}
          title={t('power.shutdownHint')}
          className="flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Power size={14} />
          {t('power.shutdown')}
        </button>
        <button
          onClick={() => {
            onClose();
            requestSystemReset();
          }}
          title={t('reset.hint')}
          className="flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RefreshCw size={14} />
          {t('power.restart')}
        </button>
      </div>
    </div>
  );
}

function AppSection({
  title,
  apps,
  onLaunch,
}: {
  title: string;
  apps: AppDescriptor[];
  onLaunch: (appId: string) => void;
}): ReactNode {
  return (
    <div className="vibe-startsection">
      <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      <div className="grid grid-cols-3 gap-1">
        {apps.map((app) => (
          <button key={app.id} onClick={() => onLaunch(app.id)} className="vibe-startapp">
            <AppIcon name={app.icon} presetId={app.presetId} label={app.name} className="size-7" />
            <span className="line-clamp-1 text-xs text-foreground/90">{app.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

registerComponent('start-menu', DefaultStartMenu);

export function StartMenu(props: { open: boolean; onClose: () => void }): ReactNode {
  return <Overridable component="start-menu" props={props} />;
}
