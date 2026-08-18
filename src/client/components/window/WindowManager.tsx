/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/window/WindowManager.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): AnimatePresence dropped (windows animate themselves);
 * the selector yields the open-id list so a drag re-renders one window, not all. Original license: MIT. */

import { useMemo, type ReactNode } from 'react';
import { useWindowStore } from '../../stores/windowStore';
import { Window } from './Window';

export function WindowManager(): ReactNode {
  const key = useWindowStore((s) =>
    Object.values(s.windows)
      .filter((w) => w.isOpen)
      .map((w) => w.id)
      .join(','),
  );
  const ids = useMemo(() => (key ? key.split(',') : []), [key]);
  // z order comes purely from each window's style.zIndex — never from DOM order.
  return (
    <>
      {ids.map((id) => (
        <Window key={id} windowId={id} />
      ))}
    </>
  );
}
