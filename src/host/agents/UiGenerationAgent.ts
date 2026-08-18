/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/agents/UiGenerationAgent.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): module singletons become injected deps, rewriteImages
 * dropped (no image API in v1), snapshot budget comes from config. Original license: MIT. */

import type { AiOp, DragPayload, Syscall } from '../../shared';
import { extractRegions, extractStreamingHtml, parseAiOutput } from '../ai/streamParser';
import type { SdkManager } from '../ai/SdkManager';
import type { Config } from '../config';
import type { WebToolRuntime } from '../ai/webTools';
import { WEB_TOOL_SCHEMAS } from '../ai/webTools';
import type { WsGateway } from '../gateway/wsGateway';
import type { KernelState } from '../kernel/kernelState';
import { logger } from '../log';
import { assemblePrompt, decideRenderMode } from '../prompt/PromptAssembler';
import type { AppRepo } from '../state/repos/AppRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { SettingsRepo } from '../state/repos/SettingsRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { SyscallInterpreter } from '../syscall/SyscallInterpreter';
import type { VibeosBus } from './bus';
import { applyRegionsServer, extractRegionIds } from './regionMerge';

const log = logger('ui-gen');

interface Trigger {
  firstRender?: boolean;
  op?: AiOp;
  drag?: DragPayload;
  /** Seed prompt for an AI-spawned popup window. */
  seedPrompt?: string;
}

interface InFlight {
  abort: AbortController;
  /** Generation counter — only the newest run for a window may commit. */
  gen: number;
}

/**
 * Preemptive, per-window concurrency.
 *
 * - Different windows run fully in PARALLEL (each tracked independently).
 * - Within ONE window, a new trigger PREEMPTS the in-flight one: we abort the
 *   old SDK call and start the new one immediately ("latest wins"). The aborted
 *   run writes nothing.
 *
 * UI generation runs STATELESS — each op is a fresh conversation (no session
 * resume). The full current UI is sent every time via [CURRENT UI], so the
 * model has the complete structure without relying on accumulated session
 * history (which would grow unbounded and could drift from the merged DOM).
 */
/** Append new terminal output inside the existing scrollback region.
 * `CLEAR` (the model's answer to `clear`) empties it instead. */
/** The OS prints the prompt and echoes the command itself, so every prompt-ish
 * line the model emits is a duplicate: strip them all, wherever they appear. */
function stripPromptLines(added: string, typed: string): string {
  const escaped = typed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isPromptish = (text: string): boolean => {
    const t = text.replace(/\u00a0/g, ' ').trim();
    if (!t) return false;
    // "user@host:~$", optionally followed by the command the user just typed.
    if (/^[\w.-]+@[\w.-]+[^\n]{0,40}?[$#>]\s*$/.test(t)) return true;
    if (typed && new RegExp(`^[\\w.@:~/\\-]*[$#>]\\s*${escaped}\\s*$`).test(t)) return true;
    return typed ? t === typed : false;
  };
  return added
    .replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, (whole, inner: string) =>
      isPromptish(String(inner).replace(/<[^>]+>/g, '')) ? '' : whole,
    )
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function appendToScrollback(current: string, added: string): string {
  // Nothing to add is a no-op — never an implicit clear.
  if (!added.trim()) return current;
  if (isClear(added)) return clearedScrollback(current);
  const open = /<div[^>]*data-vibeos-region=['"]scrollback['"][^>]*>/i.exec(current);
  // No region marker (the model rendered its own shape): never drop history —
  // appending after it keeps the scrollback intact.
  if (!open) return current ? `${current}\n${added}` : added;
  const start = open.index + open[0].length;
  const close = current.lastIndexOf('</div>');
  if (close <= start) return current;
  return current.slice(0, close) + added + current.slice(close);
}

function isClear(added: string): boolean {
  const text = added.replace(/<[^>]+>/g, '').trim();
  return text.toUpperCase() === 'CLEAR' && text.length === 5;
}

/** `clear` empties the scrollback but keeps its wrapper (and layout). */
function clearedScrollback(current: string): string {
  const open = /<div[^>]*data-vibeos-region=['"]scrollback['"][^>]*>/i.exec(current);
  if (!open) return '';
  const start = open.index + open[0].length;
  const close = current.lastIndexOf('</div>');
  return close > start ? current.slice(0, start) + current.slice(close) : current;
}

export class UiGenerationAgent {
  private readonly inflight = new Map<string, InFlight>();
  private readonly genCounter = new Map<string, number>();

  constructor(
    private readonly deps: {
      bus: VibeosBus;
      gateway: Pick<WsGateway, 'broadcast'>;
      windows: WindowRepo;
      apps: AppRepo;
      memory: MemoryRepo;
      settings: SettingsRepo;
      kernelState: KernelState;
      sdk: SdkManager;
      syscalls: SyscallInterpreter;
      config: Config;
      webTools?: WebToolRuntime;
    },
  ) {}

  register(): () => void {
    const { bus } = this.deps;
    const offs = [
      bus.on('window.firstRender', ({ windowId }) => this.dispatch(windowId, { firstRender: true })),
      bus.on('window.spawnRender', ({ windowId, seedPrompt }) =>
        this.dispatch(windowId, { firstRender: true, seedPrompt }),
      ),
      bus.on('op.received', ({ windowId, op }) => this.dispatch(windowId, { op })),
      bus.on('op.dragdrop', ({ windowId, source }) => {
        if (windowId) this.dispatch(windowId, { drag: source });
      }),
      bus.on('window.closed', ({ windowId }) => this.abortWindow(windowId)),
      bus.on('window.abortRender', ({ windowId }) => this.abortWindow(windowId)),
    ];
    return () => {
      for (const off of offs) off();
    };
  }

  private dispatch(windowId: string, trigger: Trigger): void {
    // One generation per window: a second action while one is in flight is
    // DROPPED, not queued and not allowed to preempt — restarting the render
    // on every impatient click is what makes a window feel stuck. Windows are
    // independent of each other, so other windows keep generating in parallel.
    if (this.inflight.has(windowId) && !trigger.firstRender) {
      log.debug(`busy [${windowId.slice(-6)}] — action ignored while rendering`);
      this.deps.gateway.broadcast('s2c.ui.busy', { windowId, busy: true });
      return;
    }

    const gen = (this.genCounter.get(windowId) ?? 0) + 1;
    this.genCounter.set(windowId, gen);
    const abort = new AbortController();
    this.inflight.set(windowId, { abort, gen });

    void this.generate(windowId, trigger, gen, abort)
      .catch((e) => {
        if (abort.signal.aborted) return; // expected on preemption
        log.error(`generate threw [${windowId.slice(-6)}]`, e instanceof Error ? e.message : e);
        this.deps.gateway.broadcast('s2c.ui.busy', { windowId, busy: false });
      })
      .finally(() => {
        // Only clear if we're still the current run (a newer one may have replaced us).
        if (this.inflight.get(windowId)?.gen === gen) this.inflight.delete(windowId);
      });
  }

  /** Stop every in-flight generation (system reset). */
  /** Prompt identity: user setting wins over the deployment config. */
  private promptId(): string {
    const pref = this.deps.settings.loadSettings().prefs.terminalPrompt;
    const value = typeof pref === 'string' && pref.trim() ? pref : this.deps.config.terminal.prompt;
    return value.trim() || 'dev@vibeos';
  }

  abortAll(): void {
    for (const windowId of [...this.inflight.keys()]) this.abortWindow(windowId);
  }

  /**
   * Stop the in-flight generation for a window (e.g. when it's closed). Bumping
   * the generation counter makes any straggler result count as stale and commit
   * nothing.
   */
  private abortWindow(windowId: string): void {
    const cur = this.inflight.get(windowId);
    if (cur) {
      cur.abort.abort();
      this.inflight.delete(windowId);
      this.genCounter.set(windowId, (this.genCounter.get(windowId) ?? 0) + 1);
      log.debug(`[${windowId.slice(-6)}] window closed — generation aborted`);
    }
  }

  /** True if this run has been superseded by a newer one for the same window. */
  private isStale(windowId: string, gen: number, abort: AbortController): boolean {
    return abort.signal.aborted || this.genCounter.get(windowId) !== gen;
  }

  private async generate(
    windowId: string,
    trigger: Trigger,
    gen: number,
    abort: AbortController,
  ): Promise<void> {
    const { gateway, windows, apps, memory, settings, kernelState, sdk, syscalls, config } =
      this.deps;
    const win = windows.getWindow(windowId);
    const app = win ? apps.getApp(win.appId) : null;
    if (!win?.isOpen || !app) {
      return;
    }

    await memory.ensureMemory(windowId, app.id);
    const mem = memory.getMemory(windowId);
    const firstRender = trigger.firstRender ?? false;

    gateway.broadcast('s2c.ui.busy', { windowId, busy: true });

    if (trigger.op || trigger.drag) {
      await memory.addInteraction({
        windowId,
        opKind: trigger.op?.kind ?? 'dragdrop',
        opPayload: trigger.op ?? trigger.drag,
      });
    }

    // Terminals echo through the OS: commit the typed line to the scrollback
    // (and show it) before the model runs, so it never vanishes when the
    // model's append lands — and it stays even if the model says nothing.
    let snapshotForPrompt = mem?.htmlSnapshot ?? '';
    if (
      app.manifest.chrome === 'terminal' &&
      trigger.op?.action === 'run' &&
      typeof trigger.op.value === 'string' &&
      trigger.op.value.trim()
    ) {
      const cmd = escapeHtml(trigger.op.value.trim());
      const echoed = appendToScrollback(
        snapshotForPrompt,
        `<div><span style="color:var(--run)">${escapeHtml(this.promptId())}:~$</span> ${cmd}</div>`,
      );
      if (echoed !== snapshotForPrompt) {
        snapshotForPrompt = echoed;
        await memory.saveSnapshot(windowId, echoed);
        gateway.broadcast('s2c.ui.patch', { windowId, mode: 'full', html: echoed });
      }
    }

    const snapshot = snapshotForPrompt;
    // Decide render mode BEFORE calling the AI — the model is then told exactly
    // which mode to use, rather than guessing.
    const renderMode = decideRenderMode({
      firstRender,
      hasSnapshot: snapshot.trim().length > 0,
      isDrag: !!trigger.drag,
      isSpawn: !!trigger.seedPrompt,
      isNavigate: trigger.op?.action === 'navigate',
    });
    const regionIds =
      renderMode === 'prefer-incremental' ? extractRegionIds(snapshot) : undefined;

    const prompt = assemblePrompt({
      app,
      memory: mem,
      recent: memory.recentInteractions(windowId),
      globalState: kernelState.snapshotForPrompt(),
      windowSize: { w: win.rect.w, h: win.rect.h - 36 /* titlebar */ },
      op: trigger.op,
      drag: trigger.drag,
      seedPrompt: trigger.seedPrompt,
      firstRender,
      renderMode,
      regionIds,
      terminalPrompt: app.manifest.chrome === 'terminal' ? this.promptId() : undefined,
      userProfile: settings.loadSettings().userProfile,
      stylePrompt: settings.loadSettings().prefs.stylePrompt as string | undefined,
      skin: settings.loadSettings().skin,
      snapshotBudget: config.ui.snapshotBudget,
    });

    const reason = firstRender
      ? 'first-render'
      : trigger.op
        ? `op:${trigger.op.kind}/${trigger.op.action ?? '?'}`
        : trigger.drag
          ? `drop:${trigger.drag.kind}`
          : '?';
    log.info(
      `${app.name} [${windowId.slice(-6)}] ${reason} mode=${renderMode} (prompt ${prompt.length} chars)`,
    );
    const t0 = performance.now();

    // Stream the HTML body to the client as it arrives (full-replace frames).
    let buffer = '';
    let lastStreamed = '';
    // Per-region content already streamed this run (id → html), so a region that
    // closed on an earlier delta isn't re-broadcast on every subsequent one.
    const streamedRegions = new Map<string, string>();
    const web = this.deps.webTools?.available() ? this.deps.webTools : undefined;
    const result = await sdk.run({
      role: 'ui-generation',
      trigger: firstRender ? 'user' : 'event',
      prompt,
      abort,
      appName: app.name,
      ...(web
        ? {
            tools: WEB_TOOL_SCHEMAS,
            onToolCall: (name, args) => web.exec(name, args),
            maxToolCalls: web.maxCalls,
          }
        : {}),
      onDelta: (text) => {
        if (this.isStale(windowId, gen, abort)) return; // superseded — stop streaming
        buffer += text;
        if (buffer.includes('<vibeos-applet>')) return; // applets render once, fully formed
        const body = extractStreamingHtml(buffer);
        if (body === null) return;

        if (renderMode === 'force-full') {
          // Full render: the streamed body IS the whole window, so push it as a
          // growing full-replace frame.
          if (body !== lastStreamed && body.length > lastStreamed.length) {
            lastStreamed = body;
            gateway.broadcast('s2c.ui.patch', {
              windowId,
              mode: 'full',
              html: body,
              streaming: true,
            });
          }
          return;
        }

        // Incremental render: stream each data-vibeos-region as soon as it
        // closes. extractRegions is depth-aware and silently skips a region
        // whose end tag hasn't arrived yet, so we never push an unbalanced
        // fragment into the DOM.
        const regions = extractRegions(body);
        if (regions.length === 0) return;
        // If the AI actually upgraded to a full structural replace it writes a
        // whole new body, so complete NON-region elements show up next to the
        // regions. Don't stream region-by-region then — that would stack half a
        // new layout over the old one; let the final full patch swap it in one go.
        let rest = body;
        for (const r of regions) rest = rest.replace(r.html, '');
        if (/<\/[a-zA-Z][\w-]*\s*>/.test(rest)) return;
        // If a data-vibeos-region attribute STILL remains in `rest`, an outer
        // region container is mid-stream and the regions we just closed are its
        // CHILDREN. Streaming them now would patch at the wrong granularity —
        // wait for the outer region to close and stream it as one unit.
        if (/data-vibeos-region/.test(rest)) return;

        const fresh = regions.filter((r) => streamedRegions.get(r.region) !== r.html);
        if (fresh.length === 0) return;
        for (const r of fresh) streamedRegions.set(r.region, r.html);
        gateway.broadcast('s2c.ui.patch', {
          windowId,
          mode: 'regions',
          regions: fresh,
          streaming: true,
        });
      },
    });

    if (this.isStale(windowId, gen, abort)) {
      // Superseded by a newer action → that run owns the UI; just drop this one.
      // Aborted while still current → the hang guard fired; the window would be
      // stuck on a spinner, so clear it and surface the failure.
      if (this.genCounter.get(windowId) !== gen) {
        log.debug(`${app.name} [${windowId.slice(-6)}] result discarded (superseded)`);
      } else {
        log.warn(`${app.name} [${windowId.slice(-6)}] aborted (${result.error ?? 'timeout'})`);
        gateway.broadcast('s2c.ui.busy', { windowId, busy: false });
        gateway.broadcast('s2c.error', { code: 'ai_failed', detail: result.error, windowId });
      }
      return;
    }

    const dt = (performance.now() - t0).toFixed(0);

    const parsed = parseAiOutput(result.text);

    const current = memory.getMemory(windowId)?.htmlSnapshot ?? mem?.htmlSnapshot ?? '';

    // Terminal windows are append-only: the scrollback above the caret is
    // immutable, so the HOST concatenates and the model only emits new lines.
    if (app.manifest.chrome === 'terminal' && !firstRender && parsed.html !== undefined) {
      const typed = typeof trigger.op?.value === 'string' ? trigger.op.value.trim() : '';
      const merged = appendToScrollback(current, stripPromptLines(parsed.html.trim(), typed));
      // A model slip must never blank a live terminal.
      parsed.html = merged.trim() ? merged : current;
    }

    if (parsed.applet !== undefined) {
      // Applets persist as their own snapshot form so a restart replays them.
      await memory.saveSnapshot(windowId, `<vibeos-applet>${parsed.applet}</vibeos-applet>`);
      gateway.broadcast('s2c.ui.patch', {
        windowId,
        mode: 'full',
        applet: parsed.applet,
        done: true,
      });
      log.info(
        `${app.name} [${windowId.slice(-6)}] applet ${parsed.applet.length} chars, ${parsed.syscalls.length} syscall(s) in ${dt}ms`,
      );
    } else if (parsed.html !== undefined) {
      await memory.saveSnapshot(windowId, parsed.html);
      gateway.broadcast('s2c.ui.patch', { windowId, mode: 'full', html: parsed.html, done: true });
      log.info(
        `${app.name} [${windowId.slice(-6)}] full render ${parsed.html.length} chars, ${parsed.syscalls.length} syscall(s) in ${dt}ms`,
      );
    } else if (parsed.regions && parsed.regions.length > 0) {
      const merged = applyRegionsServer(current, parsed.regions);
      await memory.saveSnapshot(windowId, merged);
      gateway.broadcast('s2c.ui.patch', {
        windowId,
        mode: 'regions',
        regions: parsed.regions,
        done: true,
      });
      log.info(
        `${app.name} [${windowId.slice(-6)}] patched ${parsed.regions.length} region(s), ${parsed.syscalls.length} syscall(s) in ${dt}ms`,
      );
    } else {
      gateway.broadcast('s2c.ui.busy', { windowId, busy: false });
      log.warn(
        `${app.name} [${windowId.slice(-6)}] no HTML returned (ok=${result.ok}, text ${result.text.length} chars) in ${dt}ms`,
      );
      if (!result.ok) {
        gateway.broadcast('s2c.error', { code: 'ai_failed', detail: result.error, windowId });
      }
    }

    if (parsed.summary) {
      await memory.saveSummary(windowId, parsed.summary);
      log.debug(`  summary: ${parsed.summary}`);
    }

    // Record what this run produced, for the Activity Monitor.
    const what =
      parsed.summary ||
      (parsed.html !== undefined
        ? 'Rendered full window'
        : parsed.regions?.length
          ? `Patched ${parsed.regions.length} region(s)`
          : 'No output');
    sdk.recordSummary(result.runId, what);

    if (parsed.syscalls.length > 0) {
      log.debug(`  syscalls: ${parsed.syscalls.map((c) => c.type).join(', ')}`);
      await syscalls.execute(parsed.syscalls as Syscall[], {
        windowId,
        appId: app.id,
        source: 'syscall',
      });
    }
  }
}
