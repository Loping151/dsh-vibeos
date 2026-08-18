/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/taskbar/Clock.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): rendered through the component override registry.
 * Original license: MIT. */

import { useEffect, useState, type ReactNode } from 'react';
import { useLocale } from '../../lib/i18n';
import { Overridable, registerComponent, type ComponentProps } from '../../registry/components';

function DefaultClock(_props: ComponentProps['clock']): ReactNode {
  const [now, setNow] = useState(() => new Date());
  const locale = useLocale();
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(timer);
  }, []);
  const bcp = locale === 'en' ? 'en-US' : 'zh-CN';
  return (
    <div className="vibe-clock">
      <span className="font-medium">
        {now.toLocaleTimeString(bcp, { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {now.toLocaleDateString(bcp, { month: 'short', day: 'numeric' })}
      </span>
    </div>
  );
}

registerComponent('clock', DefaultClock);

export function Clock(): ReactNode {
  return <Overridable component="clock" props={{}} />;
}
