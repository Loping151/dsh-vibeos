/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/AppRepo.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): the `apps` SQLite table becomes the vibeos_core `apps` domain table.
 * Original license: MIT. */

import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { AppDescriptor, AppManifest } from '../../../shared';
import { stripEmoji, ulid } from '../../../shared';
import { PRESET_APPS } from '../../kernel/presets';
import type { AppRecord, CoreHandle } from '../domains';

/**
 * Hidden anchor app for AI-spawned popup windows not tied to a real installed
 * app. Never listed (isInstalled = false).
 */
export const TRANSIENT_APP_ID = '__transient__';

const PRESET_RANK = new Map<string, number>(PRESET_APPS.map((p, i) => [p.id, i]));

/** SQLite `ORDER BY created_at` equivalent: presets keep their seed order inside one timestamp. */
function compareApps(a: AppRecord, b: AppRecord): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  const ra = PRESET_RANK.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const rb = PRESET_RANK.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  if (ra !== rb) return ra - rb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export class AppRepo {
  private readonly table: KvTable<string, AppRecord>;

  constructor(private readonly core: CoreHandle) {
    this.table = core.domain.table('apps');
  }

  listApps(): AppDescriptor[] {
    const rows: AppRecord[] = [];
    for (const [, app] of this.table.entries()) if (app.isInstalled) rows.push(app);
    return rows.sort(compareApps);
  }

  getApp(id: string): AppDescriptor | null {
    return this.table.get(id) ?? null;
  }

  private findByPreset(presetId: string): AppRecord | null {
    for (const [, app] of this.table.entries()) if (app.presetId === presetId) return app;
    return null;
  }

  /** Idempotent by preset id; existing rows get name/icon/manifest refreshed from code. */
  seedPresets(): Promise<void> {
    return this.core.enqueue(async () => {
      const now = Date.now();
      for (const p of PRESET_APPS) {
        const existing = this.findByPreset(p.id);
        if (existing) {
          await this.table.put(existing.id, {
            ...existing,
            name: p.name,
            icon: p.icon,
            manifest: { ...p.manifest },
            updatedAt: now,
          });
          continue;
        }
        await this.table.put(p.id, {
          id: p.id,
          name: p.name,
          kind: 'preset',
          presetId: p.id,
          icon: p.icon,
          manifest: { ...p.manifest },
          isInstalled: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  }

  /** Hard-delete an installed (non-preset) app row. */
  removeApp(appId: string): Promise<boolean> {
    return this.core.enqueue(async () => {
      const app = this.table.get(appId);
      if (!app || app.kind === 'preset') return false;
      await this.table.delete(appId);
      return true;
    });
  }

  installApp(input: { name: string; icon?: string; manifest?: AppManifest }): Promise<AppDescriptor> {
    return this.core.enqueue(async () => {
      const now = Date.now();
      const id = ulid(now);
      const app: AppRecord = {
        id,
        name: stripEmoji(input.name) || 'App',
        kind: 'virtual',
        icon: (input.icon ? stripEmoji(input.icon).trim() : '') || 'app-window',
        manifest: { ...(input.manifest ?? {}) },
        isInstalled: true,
        createdAt: now,
        updatedAt: now,
      };
      await this.table.put(id, app);
      return app;
    });
  }

  clearAll(): Promise<void> {
    return this.core.enqueue(async () => {
      for (const id of [...this.table.keys()]) await this.table.delete(id);
    });
  }

  ensureTransientApp(): Promise<string> {
    return this.core.enqueue(async () => {
      if (this.table.get(TRANSIENT_APP_ID)) return TRANSIENT_APP_ID;
      const now = Date.now();
      await this.table.put(TRANSIENT_APP_ID, {
        id: TRANSIENT_APP_ID,
        name: 'Window',
        kind: 'virtual',
        icon: 'app-window',
        manifest: {},
        isInstalled: false,
        createdAt: now,
        updatedAt: now,
      });
      return TRANSIENT_APP_ID;
    });
  }
}
