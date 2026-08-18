/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/VfsRepo.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): the vfs_nodes SQLite table becomes the vibeos_core `vfs` table.
 * Original license: MIT. */

import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { VfsLocation, VfsNode, VfsNodeType } from '../../../shared';
import { ulid } from '../../../shared';
import type { CoreHandle, VfsRecord } from '../domains';

const GRID_ROWS = 7;

export class VfsRepo {
  private readonly table: KvTable<string, VfsRecord>;

  constructor(private readonly core: CoreHandle) {
    this.table = core.domain.table('vfs');
  }

  listByLocation(location: VfsLocation): VfsNode[] {
    const rows: VfsRecord[] = [];
    for (const [, node] of this.table.entries()) if (node.location === location) rows.push(node);
    return rows.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  getNode(id: string): VfsNode | null {
    return this.table.get(id) ?? null;
  }

  private gridSlot(): { x: number; y: number } {
    let n = 0;
    for (const [, node] of this.table.entries()) if (node.location === 'desktop') n++;
    const col = Math.floor(n / GRID_ROWS);
    const row = n % GRID_ROWS;
    return { x: 24 + col * 96, y: 24 + row * 100 };
  }

  createNode(input: {
    name: string;
    type: VfsNodeType;
    mime?: string;
    content?: string;
    targetAppId?: string;
    location?: VfsLocation;
    meta?: Record<string, unknown>;
  }): Promise<VfsNode> {
    return this.core.enqueue(async () => {
      const now = Date.now();
      const id = ulid(now);
      const location = input.location ?? 'desktop';
      const slot = location === 'desktop' ? this.gridSlot() : undefined;
      const node: VfsRecord = {
        id,
        name: input.name,
        type: input.type,
        mime: input.mime,
        content: input.content,
        targetAppId: input.targetAppId,
        location,
        x: slot?.x,
        y: slot?.y,
        meta: { ...(input.meta ?? {}) },
        createdAt: now,
        updatedAt: now,
      };
      await this.table.put(id, node);
      return node;
    });
  }

  /** Moving into the recycle bin is the soft delete; x/y keep their old value when omitted. */
  moveNode(input: {
    nodeId: string;
    location: VfsLocation;
    x?: number;
    y?: number;
    parentId?: string;
  }): Promise<VfsNode | null> {
    return this.core.enqueue(async () => {
      const current = this.table.get(input.nodeId);
      if (!current) return null;
      const now = Date.now();
      const next: VfsRecord = {
        ...current,
        location: input.location,
        x: input.x ?? current.x,
        y: input.y ?? current.y,
        parentId: input.parentId,
        deletedAt: input.location === 'recyclebin' ? now : undefined,
        updatedAt: now,
      };
      await this.table.put(input.nodeId, next);
      return next;
    });
  }

  listByTargetApp(appId: string): VfsNode[] {
    return [...this.table.entries()]
      .map(([, n]) => n)
      .filter((n) => n.targetAppId === appId);
  }

  deleteNode(nodeId: string): Promise<boolean> {
    return this.core.enqueue(() => this.table.delete(nodeId));
  }

  emptyRecycleBin(): Promise<string[]> {
    return this.core.enqueue(async () => {
      const ids: string[] = [];
      for (const [id, node] of this.table.entries()) {
        if (node.location === 'recyclebin') ids.push(id);
      }
      for (const id of ids) await this.table.delete(id);
      return ids;
    });
  }

  clearAll(): Promise<void> {
    return this.core.enqueue(async () => {
      for (const id of [...this.table.keys()]) await this.table.delete(id);
    });
  }

  /** Desktop shortcut to an app; idempotent by target app. */
  ensureShortcut(appId: string, name: string, icon?: string): Promise<VfsNode | null> {
    return this.core.enqueue(async () => {
      for (const [, node] of this.table.entries()) {
        if (node.targetAppId === appId && node.type === 'shortcut') return node;
      }
      const now = Date.now();
      const id = ulid(now);
      const slot = this.gridSlot();
      const node: VfsRecord = {
        id,
        name,
        type: 'shortcut',
        targetAppId: appId,
        location: 'desktop',
        x: slot.x,
        y: slot.y,
        meta: { icon: icon ?? 'app-window' },
        createdAt: now,
        updatedAt: now,
      };
      await this.table.put(id, node);
      return node;
    });
  }
}
