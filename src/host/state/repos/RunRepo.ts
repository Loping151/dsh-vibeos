/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/AgentRepo.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): agent_runs becomes the vibeos_activity `runs` table; costUsd and
 * the never-called agent_logs are dropped. Original license: MIT. */

import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { AgentRole, AgentRun, AgentRunStatus, AgentTrigger } from '../../../shared';
import { ulid } from '../../../shared';
import type { ActivityHandle, AgentRunRecord } from '../domains';

export interface StartRunInput {
  role: AgentRole;
  trigger: AgentTrigger;
  model?: string;
  appName?: string;
  provider?: string;
}

export interface RunUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

const DEFAULT_KEEP = 500;

/** Newest first; ULIDs break timestamp ties in insertion order. */
function byRecency(a: AgentRunRecord, b: AgentRunRecord): number {
  return b.startedAt - a.startedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

export class RunRepo {
  private readonly table: KvTable<string, AgentRunRecord>;

  constructor(private readonly activity: ActivityHandle) {
    this.table = activity.domain.table('runs');
  }

  getRun(id: string): AgentRun | undefined {
    return this.table.get(id);
  }

  async startRun(input: StartRunInput): Promise<AgentRun> {
    return this.activity.enqueue(async () => {
      const now = Date.now();
      const run: AgentRunRecord = {
        id: ulid(now),
        role: input.role,
        trigger: input.trigger,
        model: input.model,
        provider: input.provider,
        appName: input.appName,
        status: 'running',
        startedAt: now,
      };
      await this.table.put(run.id, run);
      return run;
    });
  }

  async endRun(
    id: string,
    status: AgentRunStatus,
    error?: string,
    usage?: RunUsage,
  ): Promise<AgentRun | undefined> {
    return this.activity.enqueue(async () => {
      const current = this.table.get(id);
      if (!current) return undefined;
      const next: AgentRunRecord = {
        ...current,
        status,
        endedAt: Date.now(),
        error,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        cacheReadTokens: usage?.cacheReadTokens,
        cacheWriteTokens: usage?.cacheWriteTokens,
        reasoningTokens: usage?.reasoningTokens,
      };
      await this.table.put(id, next);
      return next;
    });
  }

  async setSummary(id: string, summary: string): Promise<AgentRun | undefined> {
    return this.activity.enqueue(async () => {
      const current = this.table.get(id);
      if (!current) return undefined;
      const next: AgentRunRecord = { ...current, summary };
      await this.table.put(id, next);
      return next;
    });
  }

  /** Newest runs first. */
  recentRuns(limit = 50): AgentRun[] {
    const rows: AgentRunRecord[] = [];
    for (const [, run] of this.table.entries()) rows.push(run);
    return rows.sort(byRecency).slice(0, limit);
  }

  /** `before` is a startedAt cursor for scroll pagination. */
  page(before?: number, limit = 40): { runs: AgentRun[]; hasMore: boolean } {
    const rows: AgentRunRecord[] = [];
    for (const [, run] of this.table.entries()) {
      if (before == null || run.startedAt < before) rows.push(run);
    }
    rows.sort(byRecency);
    return { runs: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  clearAll(): Promise<void> {
    return this.activity.enqueue(async () => {
      for (const id of [...this.table.keys()]) await this.table.delete(id);
    });
  }

  async prune(keep = DEFAULT_KEEP): Promise<void> {
    return this.activity.enqueue(async () => {
      const rows: AgentRunRecord[] = [];
      for (const [, run] of this.table.entries()) rows.push(run);
      if (rows.length <= keep) return;
      rows.sort(byRecency);
      for (const run of rows.slice(keep)) await this.table.delete(run.id);
    });
  }
}
