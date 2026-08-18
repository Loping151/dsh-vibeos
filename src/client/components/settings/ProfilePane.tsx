/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/settings/ProfilePane.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): adds the generated-app style preference field. Original license: MIT. */

import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';
import { Pane, GroupLabel } from './primitives';

const AREA_CLASS =
  'w-full resize-y rounded-xl border border-border bg-card p-3.5 text-[13px] leading-relaxed ' +
  'text-foreground placeholder:text-muted-foreground outline-none transition-shadow ' +
  'focus-visible:ring-2 focus-visible:ring-ring/40';

/** Textarea synced from settings while unfocused; saves on blur. */
function SettingArea({
  stored,
  placeholder,
  minH,
  onSave,
}: {
  stored: string;
  placeholder: string;
  minH: number;
  onSave: (v: string) => void;
}) {
  const [text, setText] = useState(stored);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(stored);
  }, [stored, focused]);
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (text !== stored) onSave(text);
      }}
      placeholder={placeholder}
      className={AREA_CLASS}
      style={{ minHeight: minH }}
    />
  );
}

export function ProfilePane() {
  const t = useT();
  const profile = useSettingsStore((s) => s.settings?.userProfile ?? '');
  const style = useSettingsStore((s) => (s.settings?.prefs.stylePrompt as string | undefined) ?? '');
  return (
    <Pane title={t('settings.cat.profile')}>
      <GroupLabel>{t('settings.profile.about')}</GroupLabel>
      <p className="mb-2.5 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
        {t('settings.profile.hint')}
      </p>
      <SettingArea
        stored={profile}
        placeholder={t('settings.profile.placeholder')}
        minH={160}
        onSave={(v) => wsClient.send('c2s.settings.update', { partial: { userProfile: v } })}
      />

      <GroupLabel>{t('settings.style.label')}</GroupLabel>
      <p className="mb-2.5 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
        {t('settings.style.hint')}
      </p>
      <SettingArea
        stored={style}
        placeholder={t('settings.style.placeholder')}
        minH={100}
        onSave={(v) =>
          wsClient.send('c2s.settings.update', { partial: { prefs: { stylePrompt: v } } })
        }
      />
    </Pane>
  );
}
