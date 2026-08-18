/** In-desktop confirm dialog for the system reset — rendered inside
 * #vibeos-root; browser-native dialogs are forbidden. */

import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import { AlertTriangle } from '../../icons/uiIcons';

interface ResetDialogState {
  open: boolean;
  show: () => void;
  close: () => void;
}

const useResetDialogStore = create<ResetDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));

export function requestSystemReset(): void {
  useResetDialogStore.getState().show();
}

export function ResetDialog(): ReactNode {
  const open = useResetDialogStore((s) => s.open);
  const close = useResetDialogStore((s) => s.close);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const confirm = () => {
    close();
    wsClient.send('c2s.system.reset', {});
  };

  return (
    <div
      className="absolute inset-0 grid place-items-center bg-black/40"
      style={{ zIndex: 2_000_000 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-[380px] max-w-[90%] rounded-xl border bg-card p-5 text-foreground shadow-2xl"
      >
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <AlertTriangle className="size-4 text-destructive" />
          {t('reset.title')}
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
          {t('reset.warning')}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="vibe-btn rounded-lg border bg-card px-3 py-1.5 text-[13px] text-foreground/80 transition-colors hover:bg-accent"
          >
            {t('reset.cancel')}
          </button>
          <button
            type="button"
            onClick={confirm}
            className="rounded-lg bg-destructive px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {t('reset.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
