/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/syscall/SyscallInterpreter.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): repos/gateway/bus are injected; shared window paths go
 * through WindowService. Original license: MIT. */

import type { Syscall } from '../../shared';
import type { VibeosBus } from '../agents/bus';
import type { WsGateway } from '../gateway/wsGateway';
import type { WindowService } from '../kernel/windows';
import { logger } from '../log';
import type { AppRepo } from '../state/repos/AppRepo';
import type { NotificationRepo } from '../state/repos/NotificationRepo';
import type { VfsRepo } from '../state/repos/VfsRepo';

const log = logger('syscall');

export interface SyscallContext {
  /** Window that produced these syscalls (for source attribution). */
  windowId?: string;
  appId?: string;
  source: 'syscall' | 'agent' | 'system';
}

export class SyscallInterpreter {
  constructor(
    private readonly deps: {
      gateway: Pick<WsGateway, 'broadcast'>;
      bus: VibeosBus;
      apps: AppRepo;
      vfs: VfsRepo;
      notifications: NotificationRepo;
      windowService: WindowService;
    },
  ) {}

  /** Per-call errors are logged and swallowed — one bad call never kills a batch. */
  async execute(calls: readonly Syscall[], ctx: SyscallContext): Promise<void> {
    for (const call of calls) {
      try {
        log.info(`exec ${call.type}`, call);
        await this.one(call, ctx);
      } catch (e) {
        log.error(`failed ${call.type}`, e instanceof Error ? e.message : e);
      }
    }
  }

  private async one(call: Syscall, ctx: SyscallContext): Promise<void> {
    const { gateway, bus, apps, vfs, notifications, windowService } = this.deps;
    switch (call.type) {
      case 'notify': {
        const notification = await notifications.create({
          kind: call.kind ?? 'info',
          title: call.title,
          body: call.body,
          appId: ctx.appId,
          source: ctx.source,
        });
        gateway.broadcast('s2c.syscall.notify', { notification });
        return;
      }

      case 'open': {
        const app = apps.getApp(call.appId);
        if (!app) return;
        await windowService.openApp(app);
        return;
      }

      case 'spawn-window': {
        // Anchor it to: explicit appId → source app → a generic transient app.
        let appId = call.appId ?? ctx.appId;
        if (!appId || !apps.getApp(appId)) {
          appId = await apps.ensureTransientApp();
        }
        const w = await windowService.openSeeded({
          appId,
          title: call.title,
          kind: 'app',
          rect: {
            x: 130,
            y: 100,
            w: call.width ?? 640,
            h: call.height ?? 460,
          },
        });
        bus.emit('window.spawnRender', { windowId: w.id, seedPrompt: call.prompt });
        log.info(`spawned window "${call.title}" [${w.id.slice(-6)}]`);
        return;
      }

      case 'install': {
        const app = await apps.installApp({
          name: call.name,
          icon: call.icon,
          manifest: call.manifest,
        });
        const shortcut = await vfs.ensureShortcut(app.id, app.name, app.icon);
        gateway.broadcast('s2c.syscall.appInstalled', { app, shortcut: shortcut ?? undefined });
        return;
      }

      case 'create-file': {
        const node = await vfs.createNode({
          name: call.name,
          type: 'file',
          mime: call.mime,
          content: call.content,
          location: call.location ?? 'desktop',
        });
        gateway.broadcast('s2c.syscall.fileCreated', { node });
        return;
      }

      case 'focus': {
        await windowService.focus(call.windowId);
        return;
      }

      case 'close': {
        await windowService.close(call.windowId);
        return;
      }

      case 'chrome': {
        // Reverse channel: AI content updates its window's native chrome (e.g.
        // the browser address bar). No-op without a source window; not persisted.
        if (!ctx.windowId) return;
        gateway.broadcast('s2c.chrome.set', { windowId: ctx.windowId, patch: call.set });
        return;
      }
    }
  }
}
