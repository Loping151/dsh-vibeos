/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/settings/AboutPane.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): the engine row shows the resolved UI-generation model,
 * plus the upstream credit. Original license: MIT. */

import { useConnectionStore } from '../../stores/connectionStore';
import { useT } from '../../lib/i18n';
import { Pane, Group, Row } from './primitives';

export function AboutPane() {
  const t = useT();
  const bootCount = useConnectionStore((s) => s.bootCount);
  const version = useConnectionStore((s) => s.version);
  const ui = useConnectionStore((s) => s.effective?.ui);

  return (
    <Pane title={t('settings.cat.about')}>
      <Group>
        <Row label={t('settings.about.system')}>
          <span className="text-[13px] font-medium">
            {version ? `VibeOS ${version}` : 'VibeOS'}
          </span>
        </Row>
        <Row label={t('settings.about.boots')}>
          <span className="text-[13px] font-medium">{bootCount}</span>
        </Row>
        <Row label={t('settings.about.engine')}>
          <span className="text-[13px] font-medium">
            {ui ? `${ui.provider} · ${ui.model}` : '—'}
          </span>
        </Row>
      </Group>
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Based on VibeOS (https://github.com/benis-me/VibeOS), MIT.
      </p>
    </Pane>
  );
}
