/** System reset: wipe the desktop session (windows, apps, vfs, memory, runs,
 * notifications, kernel state) while keeping settings, then replay the
 * first-boot path and tell every client to re-hello. */

import type { UiGenerationAgent } from '../agents/UiGenerationAgent';
import type { WsGateway } from '../gateway/wsGateway';
import { logger } from '../log';
import type { AppRepo } from '../state/repos/AppRepo';
import type { GeometryRepo } from '../state/repos/GeometryRepo';
import type { KernelRepo } from '../state/repos/KernelRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { NotificationRepo } from '../state/repos/NotificationRepo';
import type { RunRepo } from '../state/repos/RunRepo';
import type { VfsRepo } from '../state/repos/VfsRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { VibeosDomains } from '../state/domains';
import type { ArchiveRecord } from '../state/domains';
import type { KernelState } from './kernelState';
import type { WindowInitializer } from './windowInit';

const ARCHIVE_KEEP = 3;

type Rows = Record<string, unknown>;

function dumpTable(domain: { table(name: string): unknown }, name: string): Rows {
  const t = domain.table(name) as { entries(): Iterable<[string, unknown]> };
  return Object.fromEntries(t.entries());
}

async function loadTable(
  domain: { table(name: string): unknown },
  name: string,
  rows: Rows,
): Promise<void> {
  const t = domain.table(name) as {
    keys(): Iterable<string>;
    delete(k: string): Promise<unknown>;
    put(k: string, v: unknown): Promise<unknown>;
  };
  for (const k of [...t.keys()]) await t.delete(k);
  for (const [k, v] of Object.entries(rows)) await t.put(k, v);
}

const log = logger('reset');

export class SystemResetService {
  constructor(
    private readonly deps: {
      gateway: Pick<WsGateway, 'broadcast'>;
      uiAgent: UiGenerationAgent;
      kernelRepo: KernelRepo;
      kernelState: KernelState;
      apps: AppRepo;
      windows: WindowRepo;
      vfs: VfsRepo;
      geometry: GeometryRepo;
      memory: MemoryRepo;
      runs: RunRepo;
      notifications: NotificationRepo;
      windowInit: WindowInitializer;
      domains: VibeosDomains;
    },
  ) {}

  /** Snapshot the live session into the archive ring (skipped when empty). */
  private async archiveCurrent(): Promise<void> {
    const d = this.deps;
    const core = d.domains.core.domain;
    const mem = d.domains.memory.domain;
    const windows = dumpTable(core, 'windows');
    const apps = dumpTable(core, 'apps');
    const nonPreset = Object.values(apps).filter(
      (a) => (a as { kind?: string }).kind !== 'preset',
    ).length;
    const vfs = dumpTable(core, 'vfs');
    if (!Object.keys(windows).length && !nonPreset && !Object.keys(vfs).length) return;
    const kernel = d.kernelRepo.loadKernel();
    const record: ArchiveRecord = {
      id: kernel.sessionId ?? `s${Date.now()}`,
      archivedAt: Date.now(),
      windows,
      apps,
      vfs,
      geometry: dumpTable(core, 'geometry'),
      memory: dumpTable(mem, 'memory'),
      interactions: dumpTable(mem, 'interactions'),
      globalState: kernel.globalState,
    };
    const archives = this.deps.domains.archive.domain.table('archives');
    await this.deps.domains.archive.enqueue(async () => {
      await archives.put(record.id, record);
      const all = [...archives.entries()]
        .map(([, v]) => v)
        .sort((a, b) => b.archivedAt - a.archivedAt);
      for (const stale of all.slice(ARCHIVE_KEEP)) await archives.delete(stale.id);
    });
  }

  listArchives(): Array<{ id: string; archivedAt: number; windows: number; apps: number }> {
    const archives = this.deps.domains.archive.domain.table('archives');
    return [...archives.entries()]
      .map(([, v]) => v)
      .sort((a, b) => b.archivedAt - a.archivedAt)
      .map((a) => ({
        id: a.id,
        archivedAt: a.archivedAt,
        windows: Object.keys(a.windows).length,
        apps: Object.values(a.apps).filter((x) => (x as { kind?: string }).kind !== 'preset')
          .length,
      }));
  }

  /** Raw archive record for download. */
  exportArchive(id: string): ArchiveRecord | undefined {
    return this.deps.domains.archive.domain.table('archives').get(id);
  }

  /** Adopt an archive file produced by exportArchive. */
  async importArchive(json: string): Promise<boolean> {
    let rec: ArchiveRecord;
    try {
      rec = JSON.parse(json) as ArchiveRecord;
    } catch {
      return false;
    }
    if (!rec || typeof rec !== 'object' || !rec.windows || !rec.apps) return false;
    const archives = this.deps.domains.archive.domain.table('archives');
    const id = `${rec.id ?? 'imported'}-${Date.now().toString(36)}`;
    await this.deps.domains.archive.enqueue(() =>
      archives.put(id, { ...rec, id, archivedAt: rec.archivedAt ?? Date.now() }),
    );
    return true;
  }

  /** Swap an archived session back in (the current one is archived first). */
  async restore(id: string): Promise<boolean> {
    const d = this.deps;
    const archives = d.domains.archive.domain.table('archives');
    const rec = archives.get(id);
    if (!rec) return false;
    await this.archiveCurrent();
    d.uiAgent.abortAll();
    const core = d.domains.core.domain;
    const mem = d.domains.memory.domain;
    await loadTable(core, 'windows', rec.windows);
    await loadTable(core, 'apps', rec.apps);
    await loadTable(core, 'vfs', rec.vfs);
    await loadTable(core, 'geometry', rec.geometry);
    await loadTable(mem, 'memory', rec.memory);
    await loadTable(mem, 'interactions', rec.interactions);
    await d.kernelRepo.restoreSession(rec.globalState, rec.id);
    d.kernelState.load();
    await d.apps.seedPresets();
    await d.domains.archive.enqueue(() => archives.delete(id));
    d.gateway.broadcast('s2c.system.reset', {});
    log.info(`session ${id} restored`);
    return true;
  }

  async reset(): Promise<void> {
    const d = this.deps;
    await this.archiveCurrent();
    d.uiAgent.abortAll();
    await d.windows.clearAll();
    await d.apps.clearAll();
    await d.vfs.clearAll();
    await d.geometry.clearAll();
    await d.memory.clearAll();
    await d.runs.clearAll();
    await d.notifications.clearAll();
    await d.kernelRepo.resetKernel();
    d.kernelState.load();
    await d.apps.seedPresets();
    await d.windowInit.openWelcomeOnFirstBoot();
    d.gateway.broadcast('s2c.system.reset', {});
    log.info('system reset — session wiped, presets reseeded, settings kept');
  }
}
