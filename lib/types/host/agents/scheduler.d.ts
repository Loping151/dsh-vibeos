import type { Context } from '@deepseek-ai/cordis';
import type { UiGenerationAgent } from './UiGenerationAgent';
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
export declare class AgentScheduler {
    private readonly ctx;
    private readonly uiAgent;
    private readonly scheduled;
    private stopped;
    private readonly timers;
    private uiOff;
    constructor(ctx: Context, uiAgent: UiGenerationAgent, scheduled: readonly ScheduledAgent[]);
    start(): void;
    stop(): void;
    private schedule;
    private runTick;
}
