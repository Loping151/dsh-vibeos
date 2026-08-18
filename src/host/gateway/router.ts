/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/server/router.ts
 * + server/appHandlers.ts + server/settingsHandlers.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): provider scan/fetchModels/wallpaper.generate dropped,
 * models.list added, deps injected instead of module singletons. Original license: MIT. */

import type { WebSocket } from 'ws';
import type {
  AppManifest,
  ClientToServer,
  ClientToServerPayload,
  Settings,
  SkinManifest,
  WsEnvelope,
} from '../../shared';
import { parseClientMessage } from '../../shared/protocol/schema';
import type { AppSearch } from '../ai/appSearch';
import type { CommandPalette } from '../ai/commandPalette';
import type { ModelPolicy } from '../ai/modelPolicy';
import type { SdkManager } from '../ai/SdkManager';
import type { VibeosBus } from '../agents/bus';
import type { Config } from '../config';
import type { KernelState } from '../kernel/kernelState';
import type { SystemResetService } from '../kernel/reset';
import type { WindowService } from '../kernel/windows';
import { logger } from '../log';
import type { ImageStore } from '../state/imageStore';
import type { AppRepo } from '../state/repos/AppRepo';
import type { GeometryRepo } from '../state/repos/GeometryRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { NotificationRepo } from '../state/repos/NotificationRepo';
import type { RunRepo } from '../state/repos/RunRepo';
import type { SettingsRepo } from '../state/repos/SettingsRepo';
import type { VfsRepo } from '../state/repos/VfsRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { SyscallInterpreter } from '../syscall/SyscallInterpreter';
import type { InboundHandler, WsGateway } from './wsGateway';

const log = logger('router');

export interface RouterDeps {
  config: Config;
  version: string;
  gateway: WsGateway;
  bus: VibeosBus;
  kernelState: KernelState;
  settings: SettingsRepo;
  apps: AppRepo;
  windows: WindowRepo;
  windowService: WindowService;
  memory: MemoryRepo;
  vfs: VfsRepo;
  notifications: NotificationRepo;
  runs: RunRepo;
  geometry: GeometryRepo;
  sdk: SdkManager;
  policy: ModelPolicy;
  syscalls: SyscallInterpreter;
  appSearch: AppSearch;
  commandPalette: CommandPalette;
  imageStore: ImageStore;
  reset: SystemResetService;
  /** Built-ins (css '') + validated config custom skins, for boot.state. */
  skins: readonly SkinManifest[];
}

export class VibeosRouter implements InboundHandler {
  /** The latest in-flight app search per connection, so a new query preempts it. */
  private readonly appSearchAborts = new WeakMap<WebSocket, AbortController>();
  /** The latest in-flight command per connection, so a new command preempts it. */
  private readonly commandAborts = new WeakMap<WebSocket, AbortController>();

  constructor(private readonly deps: RouterDeps) {}

  async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    const { gateway } = this.deps;
    let envelope: WsEnvelope<unknown>;
    try {
      envelope = JSON.parse(raw) as WsEnvelope<unknown>;
    } catch {
      log.warn('malformed frame', raw.slice(0, 120));
      gateway.sendTo(ws, 's2c.error', { code: 'bad_json' });
      return;
    }
    const msg = parseClientMessage({ type: envelope.type, payload: envelope.payload });
    if (!msg) {
      log.warn(`rejected invalid message: ${String(envelope.type)}`);
      gateway.sendTo(ws, 's2c.error', { code: 'bad_message', detail: String(envelope.type) });
      return;
    }
    log.debug(`recv ${msg.type}`, msg.payload);
    const t0 = performance.now();
    try {
      await this.dispatch(ws, msg);
      log.debug(`done ${msg.type} (${(performance.now() - t0).toFixed(0)}ms)`);
    } catch (e) {
      log.error(`fail ${msg.type}`, e instanceof Error ? e.stack : e);
      gateway.sendTo(ws, 's2c.error', {
        code: 'internal',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  handleClose(ws: WebSocket): void {
    this.appSearchAborts.get(ws)?.abort();
    this.commandAborts.get(ws)?.abort();
  }

  private async dispatch(ws: WebSocket, msg: ClientToServer): Promise<void> {
    const { gateway, bus, windows, windowService, vfs, geometry, notifications, sdk, runs } =
      this.deps;
    switch (msg.type) {
      case 'c2s.boot.hello':
        return this.sendBootState(ws);

      case 'c2s.op':
        bus.emit('op.received', msg.payload);
        return;

      case 'c2s.op.dragdrop':
        bus.emit('op.dragdrop', msg.payload);
        return;

      case 'c2s.window.open':
        return this.handleOpen(msg.payload.appId);

      case 'c2s.window.close':
        return windowService.close(msg.payload.windowId);

      case 'c2s.window.focus':
        return windowService.focus(msg.payload.windowId);

      case 'c2s.window.minimize': {
        const w = await windows.setWindowState(msg.payload.windowId, 'minimized');
        if (w) gateway.broadcast('s2c.window.stateChanged', { window: w });
        return;
      }

      case 'c2s.window.maximize': {
        const cur = windows.getWindow(msg.payload.windowId);
        const next = cur?.state === 'maximized' ? 'normal' : 'maximized';
        const w = await windows.setWindowState(msg.payload.windowId, next);
        if (w) gateway.broadcast('s2c.window.stateChanged', { window: w });
        return;
      }

      case 'c2s.window.move': {
        const { windowId, x, y, w, h } = msg.payload;
        const win = await windows.moveWindow(windowId, { x, y, w, h });
        if (win) {
          gateway.broadcast('s2c.window.moved', { window: win });
          // Remember geometry per real app (not transient launches or widgets)
          // so reopening the app restores its last size + position.
          await geometry.rememberForWindow(win, { x, y, w, h });
        }
        return;
      }

      case 'c2s.window.reorder': {
        await windows.reorderWindows(msg.payload.ids);
        gateway.broadcast('s2c.window.reordered', { ids: msg.payload.ids });
        return;
      }

      case 'c2s.window.undo':
        return this.handleHistorySwap(ws, msg.payload.windowId, 'undo');

      case 'c2s.window.redo':
        return this.handleHistorySwap(ws, msg.payload.windowId, 'redo');

      case 'c2s.vfs.move': {
        const node = await vfs.moveNode(msg.payload);
        if (node) gateway.broadcast('s2c.vfs.changed', { node });
        return;
      }

      case 'c2s.vfs.delete': {
        if (await vfs.deleteNode(msg.payload.nodeId)) {
          gateway.broadcast('s2c.vfs.removed', { ids: [msg.payload.nodeId] });
        }
        return;
      }

      case 'c2s.vfs.empty': {
        const ids = await vfs.emptyRecycleBin();
        if (ids.length) gateway.broadcast('s2c.vfs.removed', { ids });
        return;
      }

      case 'c2s.vfs.open': {
        const node = vfs.getNode(msg.payload.nodeId);
        if (node?.type === 'shortcut' && node.targetAppId) {
          return this.handleOpen(node.targetAppId);
        }
        // Files open in a viewer app — for now open the file-manager focused on it.
        if (node) {
          return this.handleOpen('file-manager');
        }
        return;
      }

      case 'c2s.settings.update':
        return this.handleSettingsUpdate(msg.payload.partial as Partial<Settings>);

      case 'c2s.wallpaper.upload':
        return this.handleWallpaperUpload(ws, msg.payload);

      case 'c2s.notification.read': {
        await notifications.markRead(msg.payload.id);
        gateway.broadcast('s2c.notification.read', { id: msg.payload.id });
        return;
      }

      case 'c2s.notification.click':
        return this.handleNotificationClick(msg.payload.id);

      case 'c2s.app.search': {
        // Cancel this connection's previous in-flight search so fast typing
        // doesn't leave redundant AI generations running.
        this.appSearchAborts.get(ws)?.abort();
        const ctrl = new AbortController();
        this.appSearchAborts.set(ws, ctrl);
        const results = await this.deps.appSearch.searchApps(msg.payload.query, ctrl);
        if (ctrl.signal.aborted) return; // superseded — a newer search took over
        gateway.sendTo(ws, 's2c.app.searchResults', {
          requestId: msg.payload.requestId,
          results,
        });
        return;
      }

      case 'c2s.command.run': {
        // AI command palette: interpret the instruction into syscalls and run them.
        this.commandAborts.get(ws)?.abort();
        const ctrl = new AbortController();
        this.commandAborts.set(ws, ctrl);
        try {
          const calls = await this.deps.commandPalette.runCommand(msg.payload.text, ctrl);
          if (ctrl.signal.aborted) return; // superseded
          await this.deps.syscalls.execute(calls, { source: 'syscall' });
          gateway.sendTo(ws, 's2c.command.result', {
            requestId: msg.payload.requestId,
            count: calls.length,
          });
        } catch (e) {
          if (ctrl.signal.aborted) return;
          gateway.sendTo(ws, 's2c.command.result', {
            requestId: msg.payload.requestId,
            count: 0,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }

      case 'c2s.app.launch':
        return this.handleAppLaunch(msg.payload);

      case 'c2s.app.save':
        return this.handleAppSave(msg.payload);

      case 'c2s.app.export':
        return this.handleAppExport(ws, msg.payload);

      case 'c2s.app.import':
        return this.handleAppImport(msg.payload);

      case 'c2s.app.uninstall':
        return this.handleAppUninstall(msg.payload);

      case 'c2s.activity.fetch': {
        const limit = Math.min(Math.max(msg.payload.limit ?? 40, 1), 100);
        const page = runs.page(msg.payload.before, limit);
        gateway.sendTo(ws, 's2c.activity.page', page);
        return;
      }

      case 'c2s.activity.stop': {
        sdk.stopRun(msg.payload.runId);
        return;
      }

      case 'c2s.models.list': {
        gateway.sendTo(ws, 's2c.models.info', {
          effective: this.deps.policy.effectiveModels(),
          catalog: await this.deps.policy.listCatalog(),
        });
        return;
      }

      case 'c2s.system.reset':
        return this.deps.reset.reset();

      case 'c2s.session.list':
        gateway.sendTo(ws, 's2c.session.list', { sessions: this.deps.reset.listArchives() });
        return;

      case 'c2s.session.export': {
        const rec = this.deps.reset.exportArchive(msg.payload.id);
        if (!rec) {
          gateway.sendTo(ws, 's2c.error', { code: 'no_app', detail: msg.payload.id });
          return;
        }
        const stamp = new Date(rec.archivedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
        gateway.sendTo(ws, 's2c.session.exported', {
          name: `vibeos-session-${stamp}`,
          json: JSON.stringify(rec, null, 2),
        });
        return;
      }

      case 'c2s.session.import':
        void this.deps.reset.importArchive(msg.payload.json).then((ok) => {
          if (!ok) gateway.sendTo(ws, 's2c.error', { code: 'bad_json' });
          else gateway.sendTo(ws, 's2c.session.list', { sessions: this.deps.reset.listArchives() });
        });
        return;

      case 'c2s.session.restore':
        void this.deps.reset.restore(msg.payload.id).then((ok) => {
          if (!ok) gateway.sendTo(ws, 's2c.error', { code: 'no_app', detail: msg.payload.id });
        });
        return;
    }
  }

  /** Single-slot undo/redo: abort the window's in-flight run, swap snapshots. */
  private async handleHistorySwap(
    ws: WebSocket,
    windowId: string,
    kind: 'undo' | 'redo',
  ): Promise<void> {
    const { gateway, bus, memory } = this.deps;
    bus.emit('window.abortRender', { windowId });
    const html = await memory.swapSnapshot(windowId);
    if (html === undefined) {
      gateway.sendTo(ws, 's2c.ui.busy', { windowId, busy: false });
      return;
    }
    gateway.broadcast('s2c.ui.patch', { windowId, mode: 'full', html, done: true });
    await memory.addInteraction({
      windowId,
      opKind: kind,
      opPayload: null,
      resultSummary: kind === 'undo' ? '用户撤销了上一次界面变更' : '用户重做了界面变更',
    });
  }

  private async handleOpen(appId: string): Promise<void> {
    const app = this.deps.apps.getApp(appId);
    if (!app) {
      this.deps.gateway.broadcast('s2c.error', { code: 'no_app', detail: appId });
      return;
    }
    await this.deps.windowService.openApp(app);
  }

  private async handleSettingsUpdate(partial: Partial<Settings>): Promise<void> {
    const settings = await this.deps.settings.updateSettings(partial);
    this.deps.gateway.broadcast('s2c.settings.changed', { settings });
  }

  private async handleWallpaperUpload(
    ws: WebSocket,
    p: ClientToServerPayload<'c2s.wallpaper.upload'>,
  ): Promise<void> {
    const path = await this.deps.imageStore.put(p.dataUrl, this.deps.config.wallpaperMaxBytes);
    if (!path) {
      this.deps.gateway.sendTo(ws, 's2c.error', { code: 'wallpaper_bad_image' });
      return;
    }
    await this.handleSettingsUpdate({ prefs: { wallpaper: path } });
  }

  private async handleNotificationClick(id: string): Promise<void> {
    const { gateway, bus, notifications, apps, windowService } = this.deps;
    await notifications.markRead(id);
    gateway.broadcast('s2c.notification.read', { id });
    const notif = notifications.get(id);
    if (!notif) return;
    log.info(`notification clicked: "${notif.title}" (app=${notif.appId ?? '—'})`);
    const targetAppId = notif.action?.openAppId ?? notif.appId;
    if (targetAppId && apps.getApp(targetAppId)) {
      // The notification belongs to an app → open/focus it and let that app
      // react to being opened from this notification.
      const windowId = await windowService.ensureOpenWindow(targetAppId);
      if (windowId) {
        bus.emit('op.received', {
          windowId,
          op: {
            kind: 'custom',
            action: 'open-notification',
            dataset: {
              notificationTitle: notif.title,
              notificationBody: notif.body ?? '',
              notificationId: notif.id,
            },
          },
        });
      }
    } else {
      // No associated app (most ambient/system notifications) → pop a fresh
      // window and let the AI generate whatever clicking this notification
      // should reveal, based on its content.
      const appId = await apps.ensureTransientApp();
      const w = await windowService.openSeeded({
        appId,
        title: notif.title,
        kind: 'app',
        rect: { x: 150, y: 100, w: 640, h: 460 },
      });
      const seed = `The user clicked a system notification titled "${notif.title}"${
        notif.body ? ` with the message: "${notif.body}"` : ''
      }. Open the relevant screen that this notification leads to — e.g. the new email/message, the update details, the reminder, etc. Generate a complete, believable view for what opening this notification reveals.`;
      bus.emit('window.spawnRender', { windowId: w.id, seedPrompt: seed });
    }
  }

  /** Spawn a fresh window (or desktop widget) and generate its content live. */
  private async handleAppLaunch(p: ClientToServerPayload<'c2s.app.launch'>): Promise<void> {
    const { apps, windowService, bus } = this.deps;
    const appId = await apps.ensureTransientApp();
    const widget = !!p.widget;
    const w = await windowService.openSeeded({
      appId,
      title: p.name,
      kind: widget ? 'widget' : 'app',
      rect: widget ? { x: 60, y: 60, w: 320, h: 260 } : { x: 140, y: 90, w: 820, h: 580 },
    });
    const seed = widget
      ? `Generate a compact desktop WIDGET called "${p.name}".${
          p.description ? ` It is: ${p.description}.` : ''
        } It must be a small, glanceable, self-contained panel WITHOUT any window chrome that fills its area (e.g. a clock, weather, stocks, a mini to-do or player). It sits on a FROSTED-GLASS surface: use a fully TRANSPARENT background (no opaque page/container background — at most subtle translucent layers), and high-contrast, legible text and icons that read clearly over a blurred backdrop. Keep it minimal and visually striking.`
      : `Generate the application "${p.name}".${
          p.description ? ` It is: ${p.description}.` : ''
        } Produce a complete, believable, fully usable first screen for this app.`;
    log.info(`launch ${widget ? 'widget' : 'app'} "${p.name}" → window [${w.id.slice(-6)}]`);
    bus.emit('window.spawnRender', { windowId: w.id, seedPrompt: seed });
  }

  /** Freeze a window's current UI as a reusable installed app (+ desktop shortcut). */
  private async handleAppSave(p: ClientToServerPayload<'c2s.app.save'>): Promise<void> {
    const { gateway, windows, memory, apps, vfs } = this.deps;
    const win = windows.getWindow(p.windowId);
    if (!win) return;
    const snapshot = memory.getSnapshot(p.windowId);
    if (!snapshot.trim()) {
      gateway.broadcast('s2c.error', {
        code: 'ai_failed',
        detail: 'nothing to save yet',
        windowId: win.id,
      });
      return;
    }
    const src = apps.getApp(win.appId);
    const name = (p.name ?? win.title ?? src?.name ?? 'App').trim() || 'App';
    const app = await apps.installApp({
      name,
      icon: p.icon ?? src?.icon ?? 'app-window',
      manifest: {
        description: src?.manifest.description,
        defaultSize: src?.manifest.defaultSize,
        seedHtml: snapshot,
      },
    });
    const shortcut = await vfs.ensureShortcut(app.id, app.name, app.icon);
    gateway.broadcast('s2c.syscall.appInstalled', { app, shortcut: shortcut ?? undefined });
    log.info(`saved window [${win.id.slice(-6)}] as app "${name}"`);
  }

  /** Export an installed app to a shareable .vibeapp file on the desktop. */
  private async handleAppExport(
    ws: import('ws').WebSocket,
    p: ClientToServerPayload<'c2s.app.export'>,
  ): Promise<void> {
    const { gateway, apps } = this.deps;
    const app = apps.getApp(p.appId);
    if (!app) return;
    const json = JSON.stringify(
      { vibeapp: 1, name: app.name, icon: app.icon, manifest: app.manifest },
      null,
      2,
    );
    gateway.sendTo(ws, 's2c.app.exported', { name: app.name, json });
    log.info(`exported app "${app.name}" as download`);
  }

  /** Import an app from a .vibeapp JSON string. */
  private async handleAppUninstall(p: { appId: string }): Promise<void> {
    const { apps, vfs, windows, windowService, gateway } = this.deps;
    const removed = await apps.removeApp(p.appId);
    if (!removed) {
      gateway.broadcast('s2c.error', { code: 'no_app', detail: p.appId });
      return;
    }
    for (const win of windows.listOpenWindows().filter((w) => w.appId === p.appId)) {
      await windowService.close(win.id);
    }
    const nodes = vfs.listByTargetApp(p.appId);
    for (const n of nodes) await vfs.deleteNode(n.id);
    gateway.broadcast('s2c.app.removed', { appId: p.appId, nodeIds: nodes.map((n) => n.id) });
  }

  private async handleAppImport(p: ClientToServerPayload<'c2s.app.import'>): Promise<void> {
    const { gateway, apps, vfs } = this.deps;
    type VibeApp = { name?: string; icon?: string; manifest?: AppManifest };
    let data: VibeApp | null = null;
    try {
      data = JSON.parse(p.json) as VibeApp;
    } catch {
      /* ignore */
    }
    if (!data || typeof data.name !== 'string' || !data.name.trim()) {
      gateway.broadcast('s2c.error', { code: 'bad_json' });
      return;
    }
    const app = await apps.installApp({
      name: data.name,
      icon: data.icon,
      manifest: data.manifest ?? {},
    });
    const shortcut = await vfs.ensureShortcut(app.id, app.name, app.icon);
    gateway.broadcast('s2c.syscall.appInstalled', { app, shortcut: shortcut ?? undefined });
    log.info(`imported app "${app.name}"`);
  }

  /** The whole restore story: full desktop state replayed on every (re)connect. */
  private sendBootState(ws: WebSocket): void {
    const { gateway, config, version, kernelState, settings, windows, apps, vfs, notifications } =
      this.deps;
    const open = windows.listOpenWindows();
    const snapshots: Record<string, string> = {};
    for (const w of open) snapshots[w.id] = this.deps.memory.getSnapshot(w.id);

    gateway.sendTo(ws, 's2c.boot.state', {
      phase: 'ready',
      version,
      bootCount: kernelState.bootCount,
      settings: settings.loadSettings(),
      windows: open,
      apps: apps.listApps(),
      desktopNodes: vfs.listByLocation('desktop'),
      recycleBinNodes: vfs.listByLocation('recyclebin'),
      notifications: notifications.listRecent(),
      globalState: kernelState.get(),
      snapshots,
      agentRuns: this.deps.runs.recentRuns(),
      skins: [...this.deps.skins],
      effective: this.deps.policy.effectiveModels(),
      features: {
        imageGen: false,
        classicDefault: config.desktop.startInClassicMode,
        bridgeDshTheme: config.skins.bridgeDshTheme,
        pinnedApps: config.desktop.pinnedApps,
        searchDebounceMs: config.desktop.searchDebounceMs,
        terminalPrompt: config.terminal.prompt,
      },
    });
    gateway.sendTo(ws, 's2c.boot.ready', {});
  }
}
