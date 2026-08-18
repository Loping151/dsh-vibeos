/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/server/router.ts
 * (handleOpen/ensureOpenWindow) + syscall/SyscallInterpreter.ts (shared open/close/focus paths).
 * Adapted for DeepSeek Harness (dsh-vibeos): the duplicated router/syscall window helpers become one
 * service. Original license: MIT. */

import type { AppDescriptor, Rect, WindowKind, WindowState } from '../../shared';
import type { VibeosBus } from '../agents/bus';
import type { WsGateway } from '../gateway/wsGateway';
import type { AppRepo } from '../state/repos/AppRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { WindowInitializer } from './windowInit';

export class WindowService {
  constructor(
    private readonly deps: {
      apps: AppRepo;
      windows: WindowRepo;
      memory: MemoryRepo;
      gateway: Pick<WsGateway, 'broadcast'>;
      bus: VibeosBus;
      init: WindowInitializer;
    },
  ) {}

  /**
   * Single-instance apps focus their existing window; multi-instance apps
   * (browser / files / terminal / virtual apps) open a fresh window each time.
   */
  async openApp(app: AppDescriptor): Promise<void> {
    if (app.manifest.singleInstance) {
      const existing = this.deps.windows.findOpenWindowByApp(app.id);
      if (existing) {
        await this.focus(existing.id);
        return;
      }
    }
    const w = await this.deps.windows.openWindow({
      appId: app.id,
      title: app.name,
      kind: app.presetId ? 'system' : 'app',
      size: app.manifest.defaultSize,
    });
    await this.deps.memory.ensureMemory(w.id, app.id);
    this.deps.gateway.broadcast('s2c.window.opened', { window: w });
    await this.deps.init.renderInitialWindow(w.id, app);
  }

  /**
   * Open the app's window if not already open; returns the window id (or null).
   * No first-render emit for an already-rendered window — the caller drives
   * generation via an op.
   */
  async ensureOpenWindow(appId: string): Promise<string | null> {
    const app = this.deps.apps.getApp(appId);
    if (!app) return null;
    const existing = this.deps.windows.findOpenWindowByApp(appId);
    if (existing) {
      await this.focus(existing.id);
      return existing.id;
    }
    const w = await this.deps.windows.openWindow({
      appId,
      title: app.name,
      kind: app.presetId ? 'system' : 'app',
      size: app.manifest.defaultSize,
    });
    await this.deps.memory.ensureMemory(w.id, appId);
    this.deps.gateway.broadcast('s2c.window.opened', { window: w });
    if (!this.deps.memory.getMemory(w.id)?.htmlSnapshot) {
      this.deps.bus.emit('window.firstRender', { windowId: w.id });
    }
    return w.id;
  }

  /** Open + announce a window whose content the caller seeds (spawn/launch paths). */
  async openSeeded(input: {
    appId: string;
    title: string;
    kind: WindowKind;
    rect: Rect;
  }): Promise<WindowState> {
    const w = await this.deps.windows.openWindow(input);
    await this.deps.memory.ensureMemory(w.id, input.appId);
    this.deps.gateway.broadcast('s2c.window.opened', { window: w });
    return w;
  }

  /** Close = abort any in-flight generation, hard-delete, announce. */
  async close(windowId: string): Promise<void> {
    this.deps.bus.emit('window.closed', { windowId });
    await this.deps.windows.closeWindow(windowId);
    this.deps.gateway.broadcast('s2c.window.closed', { windowId });
  }

  async focus(windowId: string): Promise<void> {
    const w = await this.deps.windows.focusWindow(windowId);
    if (w) this.deps.gateway.broadcast('s2c.window.focused', { windowId: w.id });
  }
}
