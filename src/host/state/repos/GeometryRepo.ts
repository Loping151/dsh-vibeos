/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/WindowRepo.ts
 * (getGeometry/rememberGeometry) + server/router.ts:139-143 (skip rule).
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { Rect, WindowState } from '../../../shared';
import type { CoreHandle, RectRecord } from '../domains';
import { TRANSIENT_APP_ID } from './AppRepo';

export class GeometryRepo {
  private readonly table: KvTable<string, RectRecord>;

  constructor(private readonly core: CoreHandle) {
    this.table = core.domain.table('geometry');
  }

  getGeometry(appId: string): Rect | null {
    const r = this.table.get(appId);
    return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null;
  }

  rememberGeometry(appId: string, r: Rect): Promise<void> {
    return this.core.enqueue(() =>
      this.table.put(appId, {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.w),
        h: Math.round(r.h),
        updatedAt: Date.now(),
      }),
    );
  }

  clearAll(): Promise<void> {
    return this.core.enqueue(async () => {
      for (const id of [...this.table.keys()]) await this.table.delete(id);
    });
  }

  /** Widgets and transient launches have no app identity worth remembering. */
  async rememberForWindow(win: WindowState, r: Rect): Promise<void> {
    if (win.kind === 'widget' || win.appId === TRANSIENT_APP_ID) return;
    await this.rememberGeometry(win.appId, r);
  }
}
