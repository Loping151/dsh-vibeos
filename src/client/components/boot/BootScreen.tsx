/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/boot/BootScreen.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): rendered through the component override registry.
 * Original license: MIT. */

import type { ReactNode } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useT } from '../../lib/i18n';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';

function DefaultBootScreen(_props: ComponentProps['boot-screen']): ReactNode {
  const phase = useConnectionStore((s) => s.bootPhase);
  const t = useT();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background text-foreground">
      <div className="text-[28px] font-bold tracking-wide">VibeOS</div>
      <div className="breathe size-1.5 rounded-full bg-brand" />
      <div className="text-[13px] text-muted-foreground">{t(`boot.${phase}`)}</div>
    </div>
  );
}

registerComponent('boot-screen', DefaultBootScreen);

export function BootScreen(): ReactNode {
  return <Overridable component="boot-screen" props={{}} />;
}
