/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/domain/agent.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

export type AgentRole = 'ui-generation' | 'system-event' | 'maintenance';
export type AgentTrigger = 'timer' | 'event' | 'user';
export type AgentRunStatus = 'running' | 'ok' | 'error' | 'aborted';

export interface AgentRun {
  id: string;
  role: AgentRole;
  trigger: AgentTrigger;
  model?: string;
  status: AgentRunStatus;
  startedAt: number;
  endedAt?: number;
  error?: string;
  /** Which app/window this run was for (e.g. "Notes"), when applicable. */
  appName?: string;
  /** One-line summary of what the run produced. */
  summary?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Prompt tokens served from the provider cache. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  /** Model route that served the run, for the by-provider breakdown. */
  provider?: string;
}
