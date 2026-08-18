/** VibeOS section inside the stock DSH settings dialog (slot `settings.section`).
 * Styled with --dsw-* tokens only — it lives outside #vibeos-root, so vibe
 * tokens/classes do not apply here. Writes go through the same WS settings
 * path the desktop uses, so both UIs stay in sync. */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ModelRef } from '../../../shared/index';
import { useSettingsStore } from '../../stores/settingsStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { listSkins } from '../../registry/skins';
import { wsClient } from '../../ws';
import { useT } from '../../lib/i18n';

const text: CSSProperties = { color: 'var(--dsw-alias-label-primary)', fontSize: 13 };
const dim: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 };
const field: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-primary)',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  padding: '5px 8px',
  fontSize: 13,
};

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={text}>{label}</div>
        {hint && <div style={{ ...dim, marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        background: on
          ? 'var(--dsw-alias-button-primary-fill, #3d7be0)'
          : 'var(--dsw-alias-border-l3)',
        boxShadow: 'inset 0 0 0 1px var(--dsw-alias-border-l2)',
        position: 'relative',
        transition: 'background 0.15s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(0, 0, 0, 0.08)',
          transition: 'left 0.15s',
        }}
      />
    </button>
  );
}

function ModelSelect({
  role,
  current,
  onPick,
}: {
  role: 'ui' | 'fast';
  current: ModelRef | undefined;
  onPick: (ref: ModelRef | undefined) => void;
}) {
  const t = useT();
  const catalog = useConnectionStore((s) => s.catalog);
  const effective = useConnectionStore((s) => s.effective);
  const value = current ? `${current.provider}::${current.model}` : '';
  const eff = effective?.[role];
  return (
    <select
      style={{ ...field, maxWidth: 240 }}
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return onPick(undefined);
        const [provider, model] = v.split('::');
        if (provider && model) onPick({ provider, model });
      }}
    >
      <option value="">
        {t('settings.model.auto')}
        {eff ? ` (${eff.model})` : ''}
      </option>
      {(catalog ?? []).map((p) =>
        p.models.map((m) => (
          <option key={`${p.provider}::${m.id}`} value={`${p.provider}::${m.id}`}>
            {p.provider} / {m.name || m.id}
          </option>
        )),
      )}
    </select>
  );
}

function Interval({
  value,
  fallback,
  min,
  onCommit,
}: {
  value: number | undefined;
  fallback: number;
  min: number;
  onCommit: (ms: number) => void;
}) {
  const current = Math.round((value ?? fallback * 1000) / 1000);
  const [txt, setTxt] = useState(String(current));
  useEffect(() => setTxt(String(current)), [current]);
  const commit = () => {
    const n = Number(txt);
    const secs = Number.isFinite(n) && n > 0 ? Math.max(min, Math.round(n)) : current;
    setTxt(String(secs));
    if (secs !== current) onCommit(secs * 1000);
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        inputMode="numeric"
        style={{ ...field, width: 64, textAlign: 'right' }}
      />
      <span style={dim}>s</span>
    </span>
  );
}

const EMPTY_INTERVALS: { systemEventMs?: number; maintenanceMs?: number } = {};

export function VibeosSection(): ReactNode {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const connected = useConnectionStore((s) => s.connected);
  const intervals = useSettingsStore((s) => s.settings?.prefs.agentIntervals) ?? EMPTY_INTERVALS;
  const [confirmReset, setConfirmReset] = useState(false);
  const [styleDraft, setStyleDraft] = useState<string | null>(null);

  useEffect(() => {
    wsClient.send('c2s.models.list', {});
  }, []);

  const update = (partial: Record<string, unknown>) =>
    wsClient.send('c2s.settings.update', { partial });
  const updatePrefs = (prefs: Record<string, unknown>) => update({ prefs });

  if (!connected || !settings) {
    return <div style={{ ...dim, padding: '12px 0' }}>{t('boot.connecting')}</div>;
  }

  const classic = settings.prefs.classicMode === true;
  const storedStyle = (settings.prefs.stylePrompt as string | undefined) ?? '';

  return (
    <div style={{ maxWidth: 520, paddingRight: 12, paddingBottom: 24 }}>
      <Row label={t('mode.desktop')} hint={t('mode.classicHint')}>
        <Toggle on={!classic} onChange={(on) => updatePrefs({ classicMode: !on })} />
      </Row>
      <Row label={t('settings.skin')}>
        <select
          style={{ ...field, maxWidth: 200 }}
          value={settings.skin ?? 'devdock'}
          onChange={(e) => update({ skin: e.target.value })}
        >
          {listSkins().map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('settings.language')}>
        <select
          style={{ ...field, maxWidth: 200 }}
          value={settings.locale ?? 'zh'}
          onChange={(e) => update({ locale: e.target.value })}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </Row>
      <Row label={t('settings.role.ui.label')}>
        <ModelSelect
          role="ui"
          current={settings.modelOverrides.ui}
          onPick={(ref) => update({ modelOverrides: { ui: ref ?? null } })}
        />
      </Row>
      <Row label={t('settings.role.fast.label')}>
        <ModelSelect
          role="fast"
          current={settings.modelOverrides.fast}
          onPick={(ref) => update({ modelOverrides: { fast: ref ?? null } })}
        />
      </Row>
      <Row label={t('settings.proactive')} hint={t('settings.proactive.hint')}>
        <Toggle
          on={settings.prefs.proactiveAgents !== false}
          onChange={(on) => updatePrefs({ proactiveAgents: on })}
        />
      </Row>
      <Row label={t('settings.agents.sysInterval')} hint={t('settings.agents.sysInterval.hint')}>
        <Interval
          value={intervals.systemEventMs}
          fallback={75}
          min={30}
          onCommit={(ms) => updatePrefs({ agentIntervals: { ...intervals, systemEventMs: ms } })}
        />
      </Row>
      <Row label={t('settings.agents.maintInterval')} hint={t('settings.agents.maintInterval.hint')}>
        <Interval
          value={intervals.maintenanceMs}
          fallback={300}
          min={120}
          onCommit={(ms) => updatePrefs({ agentIntervals: { ...intervals, maintenanceMs: ms } })}
        />
      </Row>
      <div style={{ padding: '9px 0' }}>
        <div style={text}>{t('settings.style.label')}</div>
        <textarea
          value={styleDraft ?? storedStyle}
          onChange={(e) => setStyleDraft(e.target.value)}
          onBlur={() => {
            if (styleDraft !== null && styleDraft !== storedStyle)
              updatePrefs({ stylePrompt: styleDraft });
            setStyleDraft(null);
          }}
          placeholder={t('settings.style.placeholder')}
          style={{ ...field, width: '100%', minHeight: 64, marginTop: 6, resize: 'vertical' }}
        />
      </div>
      <Row label={t('reset.title')} hint={confirmReset ? t('reset.warning') : t('reset.hint')}>
        <button
          onClick={() => {
            if (!confirmReset) return setConfirmReset(true);
            setConfirmReset(false);
            wsClient.send('c2s.system.reset', {});
          }}
          onBlur={() => setConfirmReset(false)}
          style={{
            ...field,
            cursor: 'pointer',
            color: confirmReset ? '#fff' : 'var(--dsw-alias-state-error-primary)',
            background: confirmReset
              ? 'var(--dsw-alias-state-error-primary)'
              : 'var(--dsw-alias-bg-layer-2)',
            borderColor: 'var(--dsw-alias-state-error-primary)',
          }}
        >
          {confirmReset ? t('reset.confirm') : t('reset.title')}
        </button>
      </Row>
    </div>
  );
}
