/** ModeManager: desktop mode shadows the 'root' single slot at priority -10
 * (lowest renders — ui-layout's AppFrame sits at 0); classic mode disposes that
 * registration and parks a return pill in 'shell.overlay'. The pill registration
 * goes through ctx.slots.inject because shell.overlay is DECLARED by AppFrame,
 * which only exists while root is not shadowed (declaration-collapse safety). */

import type { ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-runtime/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import { useConnectionStore } from './stores/connectionStore';
import { useSettingsStore } from './stores/settingsStore';
import { useModeStore, LAST_MODE_KEY, type VibeosMode } from './stores/modeStore';
import { useSkin } from './registry/skins';
import { useLocale, useT } from './lib/i18n';
import { wsClient } from './ws';
import { VIBEOS_ROOT_ID } from './lib/utils';
import { BootScreen } from './components/boot/BootScreen';
import { Desktop } from './components/desktop/Desktop';

export function VibeDesktopRoot(): ReactNode {
  const phase = useConnectionStore((s) => s.bootPhase);
  const theme = useSettingsStore((s) => s.settings?.theme ?? 'dark');
  const locale = useLocale();
  const skin = useSkin();
  return (
    <div
      id={VIBEOS_ROOT_ID}
      data-skin={skin}
      lang={locale === 'en' ? 'en' : 'zh-CN'}
      className={theme === 'dark' ? 'vibe-dark' : undefined}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 0 }}
    >
      {phase === 'ready' ? <Desktop /> : <BootScreen />}
    </div>
  );
}

/** Floating pill shown only in classic mode; opts back into pointer events
 * (shell.overlay is a click-through layer). Styled with DSH tokens — it lives
 * outside #vibeos-root. */
function ReturnButton(): ReactNode {
  const t = useT();
  return (
    <button
      type="button"
      title={t('mode.return')}
      onClick={() =>
        wsClient.send('c2s.settings.update', {
          partial: { prefs: { classicMode: false } },
        })
      }
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        pointerEvents: 'auto',
        padding: '6px 14px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))',
        background: 'var(--dsw-alias-bg-layer-2, #1e1e22)',
        color: 'var(--dsw-alias-label-primary, #e6e8ee)',
        font: '600 12px/1.4 system-ui, sans-serif',
        cursor: 'pointer',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      }}
    >
      VibeOS
    </button>
  );
}

export interface ModeManager {
  dispose(): void;
}

export function createModeManager(ctx: Context): ModeManager {
  let disposeRoot: (() => void) | null = null;
  let disposePill: (() => void) | null = null;
  let disposed = false;

  const applyMode = (mode: VibeosMode) => {
    if (disposed) return;
    try {
      localStorage.setItem(LAST_MODE_KEY, mode);
    } catch {
      // private mode
    }
    if (mode === 'desktop') {
      disposePill?.();
      disposePill = null;
      disposeRoot ??= ctx.slots.register(
        { name: 'root', priority: -10 },
        VibeDesktopRoot,
      );
    } else {
      disposeRoot?.();
      disposeRoot = null;
      disposePill ??= ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          { name: 'shell.overlay', id: 'vibeos-return', order: 90 },
          ReturnButton,
        ),
      );
    }
  };

  applyMode(useModeStore.getState().mode);
  const unsub = useModeStore.subscribe((s) => applyMode(s.mode));

  return {
    dispose() {
      disposed = true;
      unsub();
      disposeRoot?.();
      disposePill?.();
      disposeRoot = null;
      disposePill = null;
    },
  };
}
