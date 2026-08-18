/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/WindowRepo.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): only OPEN windows are stored — close hard-deletes the window
 * row and its memory/interactions (VibeOS soft-closed and accumulated rows forever). Original license: MIT. */

import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { Rect, WindowDisplayState, WindowKind, WindowState } from '../../../shared';
import { ulid } from '../../../shared';
import type { CoreHandle, WindowRecord } from '../domains';
import type { GeometryRepo } from './GeometryRepo';
import type { MemoryRepo } from './MemoryRepo';

const DEFAULT_SIZE = { w: 760, h: 520 };

export class WindowRepo {
  private readonly table: KvTable<string, WindowRecord>;

  constructor(
    private readonly core: CoreHandle,
    private readonly geometry: GeometryRepo,
    private readonly memory: MemoryRepo,
  ) {
    this.table = core.domain.table('windows');
  }

  listOpenWindows(): WindowState[] {
    const rows: WindowRecord[] = [];
    for (const [, win] of this.table.entries()) if (win.isOpen) rows.push(win);
    return rows.sort((a, b) => a.order - b.order || a.z - b.z);
  }

  getWindow(id: string): WindowState | null {
    return this.table.get(id) ?? null;
  }

  findOpenWindowByApp(appId: string): WindowState | null {
    for (const [, win] of this.table.entries()) {
      if (win.appId === appId && win.isOpen) return win;
    }
    return null;
  }

  private nextZ(): number {
    let max = 0;
    for (const [, win] of this.table.entries()) if (win.isOpen && win.z > max) max = win.z;
    return max + 1;
  }

  private nextOrder(): number {
    let max = 0;
    for (const [, win] of this.table.entries()) if (win.isOpen && win.order > max) max = win.order;
    return max + 1;
  }

  private async unfocusAll(): Promise<void> {
    for (const [id, win] of this.table.entries()) {
      if (win.isOpen && win.focused) await this.table.put(id, { ...win, focused: false });
    }
  }

  /** Geometry resolve order: explicit rect → remembered per-app rect → cascade. */
  openWindow(input: {
    appId: string;
    title: string;
    kind?: WindowKind;
    rect?: Rect;
    size?: { w: number; h: number };
  }): Promise<WindowState> {
    return this.core.enqueue(async () => {
      const now = Date.now();
      const id = ulid(now);
      const z = this.nextZ();
      const order = this.nextOrder();
      const remembered = input.rect ? null : this.geometry.getGeometry(input.appId);
      const rect: Rect = input.rect ??
        remembered ?? {
          x: 70 + (z % 8) * 30,
          y: 60 + (z % 8) * 30,
          w: input.size?.w ?? DEFAULT_SIZE.w,
          h: input.size?.h ?? DEFAULT_SIZE.h,
        };
      await this.unfocusAll();
      const win: WindowRecord = {
        id,
        appId: input.appId,
        title: input.title,
        kind: input.kind ?? 'app',
        rect,
        z,
        state: 'normal',
        isOpen: true,
        focused: true,
        order,
        openedAt: now,
        updatedAt: now,
      };
      await this.table.put(id, win);
      return win;
    });
  }

  closeWindow(id: string): Promise<void> {
    return this.core.enqueue(async () => {
      await this.table.delete(id);
      await this.memory.forget(id);
    });
  }

  focusWindow(id: string): Promise<WindowState | null> {
    return this.core.enqueue(async () => {
      const current = this.table.get(id);
      if (!current) return null;
      const z = this.nextZ();
      await this.unfocusAll();
      const next: WindowRecord = {
        ...current,
        focused: true,
        z,
        state: current.state === 'minimized' ? 'normal' : current.state,
        updatedAt: Date.now(),
      };
      await this.table.put(id, next);
      return next;
    });
  }

  setWindowState(id: string, state: WindowDisplayState): Promise<WindowState | null> {
    return this.core.enqueue(async () => {
      const current = this.table.get(id);
      if (!current) return null;
      const next: WindowRecord = { ...current, state, updatedAt: Date.now() };
      await this.table.put(id, next);
      return next;
    });
  }

  moveWindow(id: string, rect: Rect): Promise<WindowState | null> {
    return this.core.enqueue(async () => {
      const current = this.table.get(id);
      if (!current) return null;
      const next: WindowRecord = { ...current, rect: { ...rect }, updatedAt: Date.now() };
      await this.table.put(id, next);
      return next;
    });
  }

  clearAll(): Promise<void> {
    return this.core.enqueue(async () => {
      for (const id of [...this.table.keys()]) await this.table.delete(id);
    });
  }

  /** Persist a new taskbar order (window ids left → right). */
  reorderWindows(ids: string[]): Promise<void> {
    return this.core.enqueue(async () => {
      const now = Date.now();
      for (let i = 0; i < ids.length; i++) {
        const current = this.table.get(ids[i]!);
        if (!current) continue;
        await this.table.put(ids[i]!, { ...current, order: i, updatedAt: now });
      }
    });
  }
}
