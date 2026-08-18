/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/settings/GeneralPane.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): the skin dropdown reads the skin registry, classic-mode and
 * DSH-theme-bridge switches added, wallpaper AI generation dropped (upload only), image paths are
 * same-origin (no API_BASE). Original license: MIT. */

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { ServerToClient } from '../../../shared/index';
import type { Locale } from '../../../shared/index';
import { useSettingsStore } from '../../stores/settingsStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useModeStore } from '../../stores/modeStore';
import { listSkins, useSkin } from '../../registry/skins';
import { vibeos } from '../../registry/index';
import { wsClient } from '../../ws';
import { fileToWallpaperDataUrl } from '../../lib/image';
import { useT, useLocale } from '../../lib/i18n';
import { requestSystemReset } from '../desktop/ResetDialog';
import { Download, Languages, Loader2, Moon, RefreshCw, Sun, Upload } from '../../icons/uiIcons';
import { Pane, GroupLabel, Group, Row, Select, Segmented, Switch } from './primitives';

const EMPTY_INTERVALS: { systemEventMs?: number; maintenanceMs?: number } = {};

export function GeneralPane() {
  const t = useT();
  const locale = useLocale();
  const theme = useSettingsStore((s) => s.settings?.theme ?? 'dark');
  const proactive = useSettingsStore((s) => s.settings?.prefs.proactiveAgents !== false);
  const bridge = useSettingsStore((s) => s.settings?.prefs.bridgeDshTheme !== false);
  const classic = useModeStore((s) => s.mode === 'classic');
  const skin = useSkin();
  const skins = listSkins();

  const setLocale = (next: Locale) =>
    wsClient.send('c2s.settings.update', { partial: { locale: next } });
  const setTheme = (next: 'light' | 'dark') =>
    wsClient.send('c2s.settings.update', { partial: { theme: next } });
  const setSkin = (next: string) =>
    wsClient.send('c2s.settings.update', { partial: { skin: next } });
  const setProactive = (on: boolean) =>
    wsClient.send('c2s.settings.update', { partial: { prefs: { proactiveAgents: on } } });
  const intervals = useSettingsStore((s) => s.settings?.prefs.agentIntervals) ?? EMPTY_INTERVALS;
  const setInterval_ = (key: 'systemEventMs' | 'maintenanceMs', ms: number) =>
    wsClient.send('c2s.settings.update', {
      partial: { prefs: { agentIntervals: { ...intervals, [key]: ms } } },
    });
  const setBridge = (on: boolean) =>
    wsClient.send('c2s.settings.update', { partial: { prefs: { bridgeDshTheme: on } } });

  return (
    <Pane title={t('settings.cat.general')}>
      <GroupLabel>{t('settings.sec.appearance')}</GroupLabel>
      <Group>
        <Row label={t('settings.theme')}>
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: t('settings.theme.light'), icon: <Sun className="size-3.5" /> },
              { value: 'dark', label: t('settings.theme.dark'), icon: <Moon className="size-3.5" /> },
            ]}
          />
        </Row>
        <Row label={t('settings.skin')} hint={t('settings.skin.hint')}>
          <Select value={skin} onChange={setSkin}>
            {skins.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Row>
        <Row label={t('settings.bridge')} hint={t('settings.bridge.hint')}>
          <Switch checked={bridge} onChange={setBridge} />
        </Row>
        <WallpaperRow />
      </Group>

      <GroupLabel>{t('settings.sec.prefs')}</GroupLabel>
      <Group>
        <Row label={t('settings.language')} hint={t('settings.language.hint')}>
          <Segmented
            value={locale}
            onChange={setLocale}
            options={[
              { value: 'zh', label: '中文', icon: <Languages className="size-3.5" /> },
              { value: 'en', label: 'English', icon: <Languages className="size-3.5" /> },
            ]}
          />
        </Row>
        <Row label={t('mode.classic')} hint={t('mode.classicHint')}>
          <Switch checked={classic} onChange={(on) => vibeos.mode.set(on ? 'classic' : 'desktop')} />
        </Row>
        <Row label={t('settings.proactive')} hint={t('settings.proactive.hint')}>
          <Switch checked={proactive} onChange={setProactive} />
        </Row>
        {proactive && (
          <Row label={t('settings.agents.sysInterval')} hint={t('settings.agents.sysInterval.hint')}>
            <IntervalSeconds
              value={intervals.systemEventMs}
              fallback={75}
              min={30}
              onCommit={(ms) => setInterval_('systemEventMs', ms)}
            />
          </Row>
        )}
        <Row label={t('settings.agents.maintInterval')} hint={t('settings.agents.maintInterval.hint')}>
          <IntervalSeconds
            value={intervals.maintenanceMs}
            fallback={300}
            min={120}
            onCommit={(ms) => setInterval_('maintenanceMs', ms)}
          />
        </Row>
        <TerminalPromptRow />
        <SessionRestoreRow />
        <Row label={t('reset.title')} hint={t('reset.hint')}>
          <button
            type="button"
            onClick={requestSystemReset}
            className="vibe-btn flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-card px-2.5 py-1.5 text-[12px] text-destructive transition-colors hover:bg-destructive hover:text-white"
          >
            <RefreshCw className="size-3.5" />
            {t('reset.title')}
          </button>
        </Row>
      </Group>
    </Pane>
  );
}

/** Desktop wallpaper: upload an image (downscaled client-side) or reset to the brand gradient. */
function WallpaperRow() {
  const t = useT();
  const wallpaper = useSettingsStore((s) => s.settings?.prefs.wallpaper);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Hold the spinner until the stored wallpaper actually decodes, not the moment
  // the path lands in settings.
  useEffect(
    () =>
      wsClient.on('s2c.settings.changed', ({ settings }) => {
        if (!busyRef.current) return;
        const wp = settings.prefs.wallpaper;
        if (!wp) return setBusy(false);
        const img = new Image();
        const done = () => setBusy(false);
        img.onload = done;
        img.onerror = done;
        img.src = wp;
      }),
    [],
  );
  useEffect(() => wsClient.on('s2c.error', () => setBusy(false)), []);
  useEffect(() => {
    if (!busy) return;
    const tmo = setTimeout(() => setBusy(false), 120_000);
    return () => clearTimeout(tmo);
  }, [busy]);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    try {
      wsClient.send('c2s.wallpaper.upload', { dataUrl: await fileToWallpaperDataUrl(file) });
    } catch {
      setBusy(false);
    }
  };

  const onReset = () =>
    wsClient.send('c2s.settings.update', { partial: { prefs: { wallpaper: '' } } });

  return (
    <div className="px-3.5 py-3">
      <div className="flex items-start gap-3.5">
        <div
          className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border bg-cover bg-center"
          style={
            wallpaper
              ? { backgroundImage: `url("${wallpaper}")` }
              : {
                  background:
                    'radial-gradient(120% 120% at 80% 0%, color-mix(in oklab, var(--brand) 32%, var(--muted)), var(--muted) 70%)',
                }
          }
        >
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-black/35">
              <Loader2 className="size-4 animate-spin text-white" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[13px]">{t('settings.wallpaper')}</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {t('settings.wallpaper.hint')}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="vibe-btn flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[12px] text-foreground/80 transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Upload className="size-3.5" />
              {t('settings.wallpaper.upload')}
            </button>
            {wallpaper && (
              <button
                type="button"
                onClick={onReset}
                disabled={busy}
                className="vibe-btn rounded-lg border bg-card px-2.5 py-1.5 text-[12px] text-foreground/80 transition-colors hover:bg-accent disabled:opacity-50"
              >
                {t('settings.wallpaper.reset')}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Terminal prompt identity, e.g. "you@laptop". */
function TerminalPromptRow() {
  const t = useT();
  const fallback = useConnectionStore((s) => s.features?.terminalPrompt ?? 'dev@vibeos');
  const stored = useSettingsStore((s) => s.settings?.prefs.terminalPrompt as string | undefined);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? stored ?? '';
  const commit = () => {
    const next = (draft ?? '').trim();
    setDraft(null);
    if (next !== (stored ?? '')) {
      wsClient.send('c2s.settings.update', { partial: { prefs: { terminalPrompt: next } } });
    }
  };
  return (
    <Row label={t('settings.terminalPrompt')} hint={t('settings.terminalPrompt.hint')}>
      <input
        value={value}
        placeholder={fallback}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        spellCheck={false}
        className="vibe-input w-44 rounded-lg border bg-card px-2 py-1 text-[12px]"
      />
    </Row>
  );
}

/** Restore one of the archived sessions (restart keeps the last three). */
function SessionRestoreRow() {
  const t = useT();
  type Sess = { id: string; archivedAt: number; windows: number; apps: number };
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [picked, setPicked] = useState('');
  useEffect(() => {
    const off = wsClient.on('s2c.session.list', (p: { sessions: Sess[] }) => {
      setSessions(p.sessions);
      setPicked((cur) => cur || p.sessions[0]?.id || '');
    });
    wsClient.send('c2s.session.list', {});
    return off;
  }, []);

  const fmt = (s: Sess) =>
    `${new Date(s.archivedAt).toLocaleString()} · ${s.windows}${t('session.windows')} ${s.apps}${t('session.apps')}`;
  return (
    <Row label={t('session.restore')} hint={t('session.restore.hint')}>
      <div className="flex items-center gap-1.5">
        <Select value={picked} onChange={setPicked}>
          {sessions.length === 0 && <option value="">{t('session.none')}</option>}
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {fmt(s)}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => picked && wsClient.send('c2s.session.restore', { id: picked })}
          className="vibe-btn rounded-lg border bg-card px-2.5 py-1.5 text-[12px] transition-colors hover:bg-accent"
        >
          {t('session.restore.go')}
        </button>
        <button
          type="button"
          title={t('session.export')}
          onClick={() => picked && wsClient.send('c2s.session.export', { id: picked })}
          className="vibe-btn rounded-lg border bg-card px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Download className="size-3.5" />
        </button>
        <label
          title={t('session.import')}
          className="vibe-btn cursor-pointer rounded-lg border bg-card px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Upload className="size-3.5" />
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              void f.text().then((json) => wsClient.send('c2s.session.import', { json }));
            }}
          />
        </label>
      </div>
    </Row>
  );
}

/** Seconds input for agent intervals: clamps to `min`, commits on blur/Enter. */
function IntervalSeconds({
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
  const [text, setText] = useState(String(current));
  useEffect(() => setText(String(current)), [current]);
  const commit = () => {
    const n = Number(text);
    const secs = Number.isFinite(n) && n > 0 ? Math.max(min, Math.round(n)) : current;
    setText(String(secs));
    if (secs !== current) onCommit(secs * 1000);
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        inputMode="numeric"
        className="vibe-input w-16 text-right"
      />
      <span className="text-[11px] text-muted-foreground">s (≥{min})</span>
    </div>
  );
}
