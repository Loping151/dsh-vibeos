/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/agents/AgentScheduler.ts
 * + agents/types.ts. Adapted for DeepSeek Harness (dsh-vibeos): setTimeout becomes fiber-bound
 * ctx.timeout, gates come from config + settings. Original license: MIT. */

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/cordis-plugin-timer';
import { logger } from '../log';
import type { UiGenerationAgent } from './UiGenerationAgent';

const log = logger('agents');

export interface TimerAgent {
  readonly role: 'system-event' | 'maintenance';
  /** Run one cycle. */
  tick(): Promise<void>;
}

export interface ScheduledAgent {
  agent: TimerAgent;
  /** Checked at fire time so setting flips apply without a reschedule. */
  enabled: () => boolean;
  /** Base interval in ms, read at every re-arm so settings changes apply live. */
  interval: () => number;
}

/**
 * Wires the event-driven UI generation agent and the timer-driven ambient
 * agents. Each tick reschedules itself with jitter (0.5×–1.5× the interval).
 */
export class AgentScheduler {
  private stopped = true;
  private readonly timers = new Map<string, () => void>();
  private uiOff: (() => void) | null = null;

  constructor(
    private readonly ctx: Context,
    private readonly uiAgent: UiGenerationAgent,
    private readonly scheduled: readonly ScheduledAgent[],
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.uiOff = this.uiAgent.register();
    for (const entry of this.scheduled) this.schedule(entry);
    log.info('scheduler started (ui-generation + system-event + maintenance)');
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const dispose of this.timers.values()) dispose();
    this.timers.clear();
    this.uiOff?.();
    this.uiOff = null;
  }

  private schedule({ agent, enabled, interval }: ScheduledAgent): void {
    const loop = (): void => {
      if (this.stopped) return;
      const jitter = interval() * (0.5 + Math.random());
      // Release the previous (already fired) timer effect before arming the next.
      this.timers.get(agent.role)?.();
      this.timers.set(
        agent.role,
        this.ctx.timeout(() => {
          void this.runTick(agent, enabled).finally(loop);
        }, jitter),
      );
    };
    loop();
  }

  private async runTick(agent: TimerAgent, enabled: () => boolean): Promise<void> {
    if (this.stopped || !enabled()) return;
    try {
      await agent.tick();
    } catch (e) {
      log.warn(`${agent.role} tick failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
