/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/kernel/boot.ts + src/index.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): SQLite/Bun.serve/provider discovery become storage domains,
 * ctx.webServer and ctx.llm; every side effect registers through ctx.effect so dispose reverts it all.
 * Original license: MIT. */

import { createRequire } from 'node:module';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import { BUILTIN_SKINS, type SkinManifest } from '../../shared';
import { VibeosBus } from '../agents/bus';
import { MaintenanceAgent } from '../agents/MaintenanceAgent';
import { AgentScheduler } from '../agents/scheduler';
import { SystemEventAgent } from '../agents/SystemEventAgent';
import { UiGenerationAgent } from '../agents/UiGenerationAgent';
import { WebToolRuntime } from '../ai/webTools';
import { AppSearch } from '../ai/appSearch';
import { CommandPalette } from '../ai/commandPalette';
import { ModelPolicy } from '../ai/modelPolicy';
import { SdkManager } from '../ai/SdkManager';
import type { Config } from '../config';
import { registerImageRoute } from '../gateway/httpRoutes';
import { VibeosRouter } from '../gateway/router';
import { isTrustedUpgrade } from '../gateway/trust';
import { WsGateway } from '../gateway/wsGateway';
import { logger } from '../log';
import { prepareCustomSkins } from '../skins/customSkins';
import { openDomains } from '../state/domains';
import { ImageStore } from '../state/imageStore';
import { AppRepo } from '../state/repos/AppRepo';
import { GeometryRepo } from '../state/repos/GeometryRepo';
import { KernelRepo } from '../state/repos/KernelRepo';
import { MemoryRepo } from '../state/repos/MemoryRepo';
import { NotificationRepo } from '../state/repos/NotificationRepo';
import { RunRepo } from '../state/repos/RunRepo';
import { SettingsRepo } from '../state/repos/SettingsRepo';
import { VfsRepo } from '../state/repos/VfsRepo';
import { WindowRepo } from '../state/repos/WindowRepo';
import { SyscallInterpreter } from '../syscall/SyscallInterpreter';
import { KernelState } from './kernelState';
import { SystemResetService } from './reset';
import { WindowInitializer } from './windowInit';
import { WindowService } from './windows';

export const WS_PATH = '/vibeos/ws';

const log = logger('boot');

const MIN_SYSTEM_EVENT_MS = 30_000;
const MIN_MAINTENANCE_MS = 120_000;

function settingsInterval(
  settings: SettingsRepo,
  key: 'systemEventMs' | 'maintenanceMs',
): number | undefined {
  const raw = (
    settings.loadSettings().prefs.agentIntervals as
      | { systemEventMs?: unknown; maintenanceMs?: unknown }
      | undefined
  )?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/** Bundle-relative first (lib/index.js → ../package.json), source-relative in dev. */
function packageVersion(): string {
  const require = createRequire(import.meta.url);
  for (const candidate of ['../package.json', '../../../package.json']) {
    try {
      const pkg = require(candidate) as { name?: string; version?: string };
      if (pkg.name === 'dsh-vibeos' && pkg.version) return pkg.version;
    } catch {
      // try the next candidate
    }
  }
  return '0.0.0';
}

export async function boot(ctx: Context, config: Config): Promise<void> {
  // 1. Storage domains; closing is the outermost disposer.
  const domains = await openDomains(ctx, config.storage.namespace);
  ctx.effect(() => () => domains.closeAll(), 'vibeos: storage domains');

  const settings = new SettingsRepo(domains.core);
  const kernelRepo = new KernelRepo(domains.core);
  const apps = new AppRepo(domains.core);
  const geometry = new GeometryRepo(domains.core);
  const memory = new MemoryRepo(domains.memory);
  const windows = new WindowRepo(domains.core, geometry, memory);
  const vfs = new VfsRepo(domains.core);
  const notifications = new NotificationRepo(domains.activity);
  const runs = new RunRepo(domains.activity);
  const kernelState = new KernelState(kernelRepo, windows, settings);
  const imageStore = new ImageStore();

  // 2. Singleton settings, preset refresh, boot counter.
  await settings.ensureSettings({ skin: config.skins.default, locale: config.locale });
  await apps.seedPresets();
  await kernelRepo.recordBoot();
  kernelState.load();

  const prepared = prepareCustomSkins(config.skins.custom);
  for (const r of prepared.rejected) log.warn(`custom skin "${r.name}" rejected: ${r.reason}`);
  for (const w of prepared.warnings) log.warn(w);
  const skins: SkinManifest[] = [...BUILTIN_SKINS, ...prepared.skins];

  // Wiring: gateway ↔ router ↔ agents, all hanging off this runtime object graph.
  const bus = new VibeosBus();
  const gateway = new WsGateway();
  const policy = new ModelPolicy(ctx, config, () => settings.loadSettings());
  void policy.primeDefaults().catch((e) => log.warn(`model default priming failed: ${String(e)}`));
  const sdk = new SdkManager(ctx, config, policy, runs, gateway, () => settings.loadSettings());
  const windowInit = new WindowInitializer({ apps, windows, memory, gateway, bus });
  const windowService = new WindowService({ apps, windows, memory, gateway, bus, init: windowInit });
  const syscalls = new SyscallInterpreter({ gateway, bus, apps, vfs, notifications, windowService });
  const appSearch = new AppSearch(sdk);
  const commandPalette = new CommandPalette(sdk, {
    listApps: () => apps.listApps(),
    listOpenWindows: () => windows.listOpenWindows(),
  });
  const uiAgent = new UiGenerationAgent({
    bus,
    gateway,
    windows,
    apps,
    memory,
    settings,
    kernelState,
    sdk,
    syscalls,
    config,
    webTools: new WebToolRuntime(ctx, config.web),
  });
  const reset = new SystemResetService({
    gateway,
    uiAgent,
    kernelRepo,
    kernelState,
    apps,
    windows,
    vfs,
    geometry,
    memory,
    runs,
    notifications,
    windowInit,
    domains,
  });
  const router = new VibeosRouter({
    config,
    version: packageVersion(),
    gateway,
    bus,
    kernelState,
    settings,
    apps,
    windows,
    windowService,
    memory,
    vfs,
    notifications,
    runs,
    geometry,
    sdk,
    policy,
    syscalls,
    appSearch,
    commandPalette,
    imageStore,
    reset,
    skins,
  });
  gateway.attach(router);

  // 3. First boot only: open Welcome before any client connects.
  if (kernelState.bootCount === 1) await windowInit.openWelcomeOnFirstBoot();

  // 4. Gateway routes.
  ctx.effect(() => registerImageRoute(ctx, imageStore), 'vibeos: /vibeos/img');
  ctx.effect(
    () =>
      ctx.webServer.registerUpgrade({
        path: WS_PATH,
        handler: (req, socket, head) => {
          if (!isTrustedUpgrade(req)) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }
          gateway.handleUpgrade(req, socket, head);
        },
      }),
    'vibeos: /vibeos/ws',
  );
  ctx.effect(() => () => gateway.teardown(), 'vibeos: terminate ws clients');

  // 5. Agents (timers are fiber-bound; stop() also releases the bus handlers).
  if (config.agents.enabled !== false) {
    // Background model calls only while VibeOS is actually in the foreground:
    // someone is connected and the desktop (not classic chat) is active.
    const foreground = () =>
      gateway.clientCount() > 0 && settings.loadSettings().prefs.classicMode !== true;
    const scheduler = new AgentScheduler(
      ctx,
      uiAgent,
      [
        {
          agent: new SystemEventAgent({ windows, kernelState, sdk, syscalls }),
          enabled: () =>
            foreground() &&
            config.agents.proactive &&
            settings.loadSettings().prefs.proactiveAgents !== false,
          interval: () =>
            Math.max(
              MIN_SYSTEM_EVENT_MS,
              settingsInterval(settings, 'systemEventMs') ?? config.agents.systemEventIntervalMs,
            ),
        },
        {
          agent: new MaintenanceAgent({
            windows,
            apps,
            memory,
            runs,
            sdk,
            runHistory: config.agents.runHistory,
          }),
          enabled: foreground,
          interval: () =>
            Math.max(
              MIN_MAINTENANCE_MS,
              settingsInterval(settings, 'maintenanceMs') ?? config.agents.maintenanceIntervalMs,
            ),
        },
      ],
    );
    ctx.effect(() => {
      scheduler.start();
      return () => scheduler.stop();
    }, 'vibeos: agents');
  }

  log.info(
    `vibeos booted (boot #${kernelState.bootCount}, ${windows.listOpenWindows().length} window(s) restored, aiStub=${config.aiStub})`,
  );
}
