/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/kernel/windowInit.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): repos/gateway/bus are injected instead of module singletons.
 * Original license: MIT. */

import type { AppDescriptor } from '../../shared';
import { NATIVE_PRESET_APPS } from '../../shared';
import type { VibeosBus } from '../agents/bus';
import type { WsGateway } from '../gateway/wsGateway';
import { logger } from '../log';
import type { AppRepo } from '../state/repos/AppRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';

const log = logger('boot');

export class WindowInitializer {
  constructor(
    private readonly deps: {
      apps: AppRepo;
      windows: WindowRepo;
      memory: MemoryRepo;
      gateway: Pick<WsGateway, 'broadcast'>;
      bus: VibeosBus;
    },
  ) {}

  /**
   * Decide how a freshly-opened window gets its first content:
   *  - native preset app (Settings / Activity Monitor / App Store) → nothing (React renders it)
   *  - app with a frozen `seedHtml` → push that snapshot immediately
   *  - otherwise → an AI first render
   */
  async renderInitialWindow(windowId: string, app: AppDescriptor): Promise<void> {
    if (app.presetId && NATIVE_PRESET_APPS.includes(app.presetId)) return;

    const seed = typeof app.manifest.seedHtml === 'string' ? app.manifest.seedHtml : '';
    if (seed.trim()) {
      await this.deps.memory.saveSnapshot(windowId, seed);
      this.deps.gateway.broadcast('s2c.ui.patch', { windowId, mode: 'full', html: seed, done: true });
      return;
    }

    this.deps.bus.emit('window.firstRender', { windowId });
  }

  /**
   * Cold start: on the very first boot, open the Welcome app so a fresh desktop
   * isn't empty. It's a normal native window — left open it persists across
   * refreshes/reboots, and once the user closes it it stays closed. Runs before
   * any client connects, so no broadcast.
   */
  async openWelcomeOnFirstBoot(): Promise<void> {
    const app = this.deps.apps.getApp('welcome');
    if (!app) return;
    const w = await this.deps.windows.openWindow({
      appId: 'welcome',
      title: app.name,
      kind: 'system',
      size: app.manifest.defaultSize,
    });
    await this.deps.memory.ensureMemory(w.id, 'welcome');
    log.info('first boot — opened Welcome window');
  }
}
