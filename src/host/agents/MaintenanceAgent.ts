/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/agents/MaintenanceAgent.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): deps injected, interval + prune cap from config.
 * Original license: MIT. */

import { parseAiOutput } from '../ai/streamParser';
import type { SdkManager } from '../ai/SdkManager';
import type { AppRepo } from '../state/repos/AppRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { RunRepo } from '../state/repos/RunRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { TimerAgent } from './scheduler';

/**
 * Background consolidation: folds each open window's recent interactions into a
 * tighter episode summary, and prunes old agent runs. Uses the fast model.
 */
export class MaintenanceAgent implements TimerAgent {
  readonly role = 'maintenance' as const;

  constructor(
    private readonly deps: {
      windows: WindowRepo;
      apps: AppRepo;
      memory: MemoryRepo;
      runs: RunRepo;
      sdk: SdkManager;
      runHistory: number;
    },
  ) {}

  async tick(): Promise<void> {
    const { windows, apps, memory, runs, sdk, runHistory } = this.deps;
    await runs.prune(runHistory);

    for (const win of windows.listOpenWindows()) {
      const mem = memory.getMemory(win.id);
      const recent = memory.recentInteractions(win.id);
      if (recent.length < 6) continue; // not enough to bother consolidating

      const app = apps.getApp(win.appId);
      const prompt = `[APP]\n${app?.name ?? win.appId}\n\n[CURRENT EPISODE SUMMARY]\n${mem?.episodeSummary ?? '(none)'}\n\n[RECENT INTERACTIONS]\n${recent
        .map((r) => `- ${r.opKind} ${JSON.stringify(r.opPayload).slice(0, 120)}`)
        .join('\n')}\n\n[TASK]\nProduce an updated concise episode summary.`;

      const result = await sdk.run({
        role: 'maintenance',
        trigger: 'timer',
        prompt,
        appName: app?.name ?? 'Maintenance',
      });
      if (!result.ok) continue;
      const parsed = parseAiOutput(result.text);
      sdk.recordSummary(result.runId, parsed.summary || 'Consolidated memory');
      if (parsed.summary) {
        await memory.saveSummary(win.id, parsed.summary);
      }
    }
  }
}
