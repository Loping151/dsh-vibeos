/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/AppMemoryRepo.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): app_memory + interactions become the vibeos_memory domain,
 * interactions are one capped list record per window, sdkSessionId dropped. Original license: MIT. */

import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { AppMemory, Interaction } from '../../../shared';
import { ulid } from '../../../shared';
import type { AppMemoryRecord, InteractionListRecord, InteractionRecord, MemoryHandle } from '../domains';

const RECENT_LIMIT = 12;
/** Rolling window of stored ops per window. */
const INTERACTION_CAP = 50;

export class MemoryRepo {
  private readonly memory: KvTable<string, AppMemoryRecord>;
  private readonly interactions: KvTable<string, InteractionListRecord>;

  constructor(private readonly handle: MemoryHandle) {
    this.memory = handle.domain.table('memory');
    this.interactions = handle.domain.table('interactions');
  }

  getMemory(windowId: string): AppMemory | null {
    return this.memory.get(windowId) ?? null;
  }

  getSnapshot(windowId: string): string {
    return this.memory.get(windowId)?.htmlSnapshot ?? '';
  }

  ensureMemory(windowId: string, appId: string): Promise<void> {
    return this.handle.enqueue(async () => {
      if (this.memory.get(windowId)) return;
      await this.memory.put(windowId, {
        windowId,
        appId,
        htmlSnapshot: '',
        episodeSummary: '',
        updatedAt: Date.now(),
      });
    });
  }

  /** Shifts the current snapshot into the single undo slot before writing. */
  saveSnapshot(windowId: string, html: string): Promise<void> {
    return this.patch(windowId, (m) => ({
      ...m,
      prevSnapshot: m.htmlSnapshot.trim() ? m.htmlSnapshot : m.prevSnapshot,
      htmlSnapshot: html,
    }));
  }

  /**
   * Swap current and previous snapshots (self-inverse: undo and redo are the
   * same operation). Returns the new current html, or undefined without prev.
   */
  swapSnapshot(windowId: string): Promise<string | undefined> {
    return this.handle.enqueue(async () => {
      const m = this.memory.get(windowId);
      const prev = m?.prevSnapshot;
      if (!m || !prev?.trim()) return undefined;
      await this.memory.put(windowId, {
        ...m,
        htmlSnapshot: prev,
        prevSnapshot: m.htmlSnapshot,
        updatedAt: Date.now(),
      });
      return prev;
    });
  }

  saveSummary(windowId: string, summary: string): Promise<void> {
    return this.patch(windowId, (m) => ({ ...m, episodeSummary: summary }));
  }

  private patch(windowId: string, fn: (m: AppMemoryRecord) => AppMemoryRecord): Promise<void> {
    return this.handle.enqueue(async () => {
      const current = this.memory.get(windowId) ?? {
        windowId,
        appId: '',
        htmlSnapshot: '',
        episodeSummary: '',
        updatedAt: 0,
      };
      await this.memory.put(windowId, { ...fn(current), updatedAt: Date.now() });
    });
  }

  /** Oldest-first, last {@link RECENT_LIMIT} ops. */
  recentInteractions(windowId: string): Interaction[] {
    const items = this.interactions.get(windowId)?.items ?? [];
    return items.slice(-RECENT_LIMIT).map((r) => ({
      id: r.id,
      windowId: r.windowId,
      seq: r.seq,
      opKind: r.opKind,
      opPayload: r.opPayload ?? null,
      resultSummary: r.resultSummary,
      createdAt: r.createdAt,
    }));
  }

  addInteraction(input: {
    windowId: string;
    opKind: string;
    opPayload: unknown;
    resultSummary?: string;
  }): Promise<void> {
    return this.handle.enqueue(async () => {
      const now = Date.now();
      const current = this.interactions.get(input.windowId);
      const items = current?.items ?? [];
      const seq = (items.length ? items[items.length - 1]!.seq : 0) + 1;
      const next: InteractionRecord = {
        id: ulid(now),
        windowId: input.windowId,
        seq,
        opKind: input.opKind,
        opPayload: input.opPayload,
        resultSummary: input.resultSummary,
        createdAt: now,
      };
      await this.interactions.put(input.windowId, {
        windowId: input.windowId,
        items: [...items, next].slice(-INTERACTION_CAP),
      });
    });
  }

  /** Window close is a hard delete: drop the snapshot and the op log with it. */
  forget(windowId: string): Promise<void> {
    return this.handle.enqueue(async () => {
      await this.memory.delete(windowId);
      await this.interactions.delete(windowId);
    });
  }

  clearAll(): Promise<void> {
    return this.handle.enqueue(async () => {
      for (const id of [...this.memory.keys()]) await this.memory.delete(id);
      for (const id of [...this.interactions.keys()]) await this.interactions.delete(id);
    });
  }
}
