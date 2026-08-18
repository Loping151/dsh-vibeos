/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/settings/DefaultModelsPane.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): the provider registry is gone — options come from the DSH
 * catalog (s2c.models.info), roles collapse to ui/fast, effort + thinking + image model are dropped
 * (config-level reasoningEffort only). Original license: MIT. */

import { useEffect } from 'react';
import type { ModelOverrides, ModelRef, ModelRole } from '../../../shared/index';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import {
  Pane,
  Group,
  Row,
  Combobox,
  MODEL_ROLES,
  type ComboOption,
} from './primitives';

const CLEARED: ModelRef = { provider: '', model: '' };

function parse(v: string): ModelRef {
  if (!v) return CLEARED;
  const i = v.indexOf('::');
  return { provider: v.slice(0, i), model: v.slice(i + 2) };
}

const EMPTY_OVERRIDES: Record<string, never> = {};

export function ModelsPane() {
  const t = useT();
  const catalog = useConnectionStore((s) => s.catalog);
  const effective = useConnectionStore((s) => s.effective);
  const overrides = useSettingsStore((s) => s.settings?.modelOverrides) ?? EMPTY_OVERRIDES;

  // The catalog is advisory and not part of boot state — ask for it on open.
  useEffect(() => wsClient.send('c2s.models.list', {}), []);

  const options: ComboOption[] = catalog.flatMap((p) =>
    p.models.map((m) => ({
      value: `${p.provider}::${m.id}`,
      label: m.name,
      sub: m.id,
      group: p.provider,
    })),
  );

  // Keep the stored selection visible even when its provider no longer lists it.
  const pick = (ref: ModelRef | undefined) => {
    const value = ref?.provider && ref.model ? `${ref.provider}::${ref.model}` : '';
    const list: ComboOption[] = [{ value: '', label: t('settings.model.auto') }, ...options];
    if (value && !options.some((o) => o.value === value)) {
      list.push({ value, label: ref!.model, sub: ref!.model, group: ref!.provider });
    }
    return { value, options: list };
  };

  const patchRole = (role: ModelRole, ref: ModelRef) => {
    const modelOverrides: ModelOverrides = role === 'ui' ? { ui: ref } : { fast: ref };
    wsClient.send('c2s.settings.update', { partial: { modelOverrides } });
  };

  return (
    <Pane title={t('settings.cat.models')}>
      {catalog.length === 0 && (
        <p className="mb-3 text-[12px] text-muted-foreground">{t('settings.models.discovering')}</p>
      )}
      {MODEL_ROLES.map((role) => {
        const current = pick(overrides[role]);
        const resolved = effective?.[role];
        return (
          <Group key={role} className="mb-2.5">
            <div className="px-3.5 py-2.5">
              <div className="text-[13px] font-medium">{t(`settings.role.${role}.label`)}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {t(`settings.role.${role}.hint`)}
              </div>
            </div>
            <Row label={t('settings.role.model')}>
              <Combobox
                value={current.value}
                options={current.options}
                onChange={(v) => patchRole(role, parse(v))}
                searchPlaceholder={t('settings.model.search')}
                emptyLabel={t('settings.model.none')}
              />
            </Row>
            {resolved && (
              <Row label={t('settings.models.effective')} hint={t(`settings.models.source.${resolved.source}`)}>
                <span className="text-[12px] text-muted-foreground">
                  {resolved.provider} · {resolved.model}
                </span>
              </Row>
            )}
          </Group>
        );
      })}
    </Pane>
  );
}
