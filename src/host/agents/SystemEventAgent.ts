/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/agents/SystemEventAgent.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): deps injected, interval from config. Original license: MIT. */

import type { Syscall } from '../../shared';
import { parseAiOutput } from '../ai/streamParser';
import type { SdkManager } from '../ai/SdkManager';
import type { KernelState } from '../kernel/kernelState';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { SyscallInterpreter } from '../syscall/SyscallInterpreter';
import type { TimerAgent } from './scheduler';

/**
 * Ambient daemon: periodically invents small believable system events
 * (notifications) so the OS feels alive. Uses the fast model.
 */
export class SystemEventAgent implements TimerAgent {
  readonly role = 'system-event' as const;

  constructor(
    private readonly deps: {
      windows: WindowRepo;
      kernelState: KernelState;
      sdk: SdkManager;
      syscalls: SyscallInterpreter;
    },
  ) {}

  async tick(): Promise<void> {
    // Only fire if there's something going on (a window open) some of the time.
    const open = this.deps.windows.listOpenWindows();
    if (open.length === 0 && Math.random() > 0.4) return;

    const prompt = `[GLOBAL STATE]\n${JSON.stringify(this.deps.kernelState.snapshotForPrompt())}\n\n[TASK]\nInvent at most one small, atmospheric system event appropriate to the current state. Emit a single notify syscall and a summary. If nothing fits, return an empty calls array.`;

    const result = await this.deps.sdk.run({
      role: 'system-event',
      trigger: 'timer',
      prompt,
      appName: 'System',
    });
    if (!result.ok) return;
    const parsed = parseAiOutput(result.text);
    this.deps.sdk.recordSummary(result.runId, parsed.summary || 'Ambient event');
    if (parsed.syscalls.length > 0) {
      await this.deps.syscalls.execute(parsed.syscalls as Syscall[], { source: 'agent' });
    }
  }
}
