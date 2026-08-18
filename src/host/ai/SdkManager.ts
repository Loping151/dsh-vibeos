/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/ai/SdkManager.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): providers collapse onto runLlm/ctx.llm, cross-provider
 * fallback and cost estimation dropped, retry delay honors ctx.llm.providerRetryPolicy.
 * Original license: MIT. */

import type { Context } from '@deepseek-ai/cordis';
import type { AgentRole, AgentTrigger, Settings } from '../../shared';
import { DEFAULT_LOCALE } from '../../shared';
import type { Config } from '../config';
import type { WsGateway } from '../gateway/wsGateway';
import { logger } from '../log';
import { localeDirective, systemPromptFor } from '../prompt/systemPrompts';
import type { RunRepo } from '../state/repos/RunRepo';
import { runLlm, type LlmRunResult } from './llmClient';
import type { ModelPolicy } from './modelPolicy';
import { stubResponse } from './stub';

const log = logger('sdk');

export interface RunOptions {
  role: AgentRole;
  trigger: AgentTrigger;
  prompt: string;
  systemPromptOverride?: string;
  /** App/window this run is for, recorded for the Activity Monitor. */
  appName?: string;
  /** Called with incremental assistant text. */
  onDelta?: (t: string) => void;
  abort?: AbortController;
  /** Optional model-callable tools (bounded loop inside runLlm). */
  tools?: import('@deepseek-ai/dsh-llm').ToolSchema[];
  onToolCall?: (name: string, argsJson: string) => Promise<{ text: string; isError: boolean }>;
  maxToolCalls?: number;
}

export interface RunResult {
  text: string;
  ok: boolean;
  error?: string;
  runId?: string;
  usage?: import('./llmClient').UsageTotals;
}

/** Failure codes worth waiting out before the single same-model retry. */
const RETRYABLE_CODES = new Set(['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE']);
const FALLBACK_RETRY_DELAY_MS = 1500;

/**
 * The single seam between the OS and the model. Resolves the role's model +
 * localized system prompt, tracks the run for the Activity Monitor, handles
 * stub mode, then streams through ctx.llm. Callers never see the provider.
 */
export class SdkManager {
  /** Live runs by id → their abort controller, so the UI can stop one. */
  private readonly runRegistry = new Map<string, AbortController>();
  /** Runs the user explicitly stopped (recorded as "aborted", not "error"). */
  private readonly stoppedRuns = new Set<string>();

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly policy: ModelPolicy,
    private readonly runs: RunRepo,
    private readonly gateway: Pick<WsGateway, 'broadcast'>,
    private readonly getSettings: () => Settings,
  ) {
    ctx.effect(
      () => () => {
        for (const controller of this.runRegistry.values()) controller.abort();
        this.runRegistry.clear();
      },
      'vibeos: abort inflight generations',
    );
  }

  /** Abort an in-flight run by id (Activity Monitor "Stop"). */
  stopRun(runId: string): void {
    const controller = this.runRegistry.get(runId);
    if (!controller) return;
    this.stoppedRuns.add(runId);
    controller.abort();
  }

  /** Attach a one-line summary of what a run produced, and re-broadcast it. */
  recordSummary(runId: string | undefined, summary: string): void {
    if (!runId || !summary.trim()) return;
    void this.runs
      .setSummary(runId, summary.trim().slice(0, 200))
      .then((run) => {
        if (run) this.gateway.broadcast('s2c.agent.run', { run });
      })
      .catch((e) => log.warn(`recordSummary failed: ${String(e)}`));
  }

  async run(opts: RunOptions): Promise<RunResult> {
    const modelRole = opts.role === 'ui-generation' ? 'ui' : 'fast';
    const resolved = this.policy.resolve(modelRole);
    const run = await this.runs.startRun({
      role: opts.role,
      trigger: opts.trigger,
      model: resolved.model,
      provider: resolved.provider,
      appName: opts.appName,
    });
    this.gateway.broadcast('s2c.agent.run', { run });

    const finish = async (result: LlmRunResult): Promise<RunResult> => {
      this.runRegistry.delete(run.id);
      const status = this.stoppedRuns.has(run.id) ? 'aborted' : result.ok ? 'ok' : 'error';
      this.stoppedRuns.delete(run.id);
      const finished = await this.runs.endRun(run.id, status, result.error, result.usage);
      if (finished) this.gateway.broadcast('s2c.agent.run', { run: finished });
      return { ...result, runId: run.id };
    };

    if (this.config.aiStub) {
      const text = stubResponse(opts.role, opts.prompt);
      opts.onDelta?.(text);
      return finish({ text, ok: true });
    }

    // Skin is applied purely via CSS (design tokens + .ai-surface control
    // styles); we deliberately do NOT tell the model the skin.
    const settings = this.getSettings();
    const locale = settings.locale ?? this.config.locale ?? DEFAULT_LOCALE;
    const systemPrompt =
      (opts.systemPromptOverride ?? systemPromptFor(opts.role)) + localeDirective(locale);

    // Reuse the caller's abort controller when given (window close already
    // aborts via it), else make one; track it for Activity Monitor Stop.
    const controller = opts.abort ?? new AbortController();
    const preempt = controller.signal;
    this.runRegistry.set(run.id, controller);

    const maxTokens = modelRole === 'ui' ? this.config.ui.maxTokens : this.config.fast.maxTokens;
    const genTimeoutMs = this.config.ui.genTimeoutMs;

    // One model attempt with its own hang-guard timeout, linked to the caller's
    // preemption signal. The timer re-arms on each streamed delta, so it fires
    // only on a true stall, not on a slow-but-progressing generation.
    const attempt = async (stream: boolean): Promise<{ result: LlmRunResult; timedOut: boolean }> => {
      const abort = new AbortController();
      const onPreempt = () => abort.abort();
      if (preempt.aborted) abort.abort();
      else preempt.addEventListener('abort', onPreempt, { once: true });

      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          timedOut = true;
          abort.abort();
        }, genTimeoutMs);
      };
      arm();
      try {
        const r = await runLlm(this.ctx, {
          system: systemPrompt,
          prompt: opts.prompt,
          provider: resolved.provider,
          model: resolved.model,
          reasoningEffort: resolved.reasoningEffort,
          maxTokens,
          abort,
          tools: opts.tools,
          onToolCall: opts.onToolCall,
          maxToolCalls: opts.maxToolCalls,
          onDelta:
            stream && opts.onDelta
              ? (t) => {
                  arm();
                  opts.onDelta!(t);
                }
              : undefined,
        });
        return {
          result: timedOut ? { ...r, ok: false, error: `timed out after ${genTimeoutMs}ms` } : r,
          timedOut,
        };
      } finally {
        clearTimeout(timer);
        preempt.removeEventListener('abort', onPreempt);
      }
    };

    log.debug(
      `query ${opts.role} via ${resolved.provider} model=${resolved.model} effort=${resolved.reasoningEffort} locale=${locale}`,
    );

    let { result, timedOut } = await attempt(true);

    // Recover from a genuine model failure (not preemption, not a hang/timeout):
    // ONE retry on the same model. The recovery attempt doesn't stream — it
    // yields a final result patched in one go.
    if (!result.ok && !timedOut && !preempt.aborted) {
      log.warn(`${resolved.provider}/${resolved.model} failed (${result.error}); retrying once`);
      await this.retryDelay(resolved.provider, result.error);
      if (!preempt.aborted) ({ result, timedOut } = await attempt(false));
    }

    if (!result.ok) log.error(`run failed (${opts.role}): ${result.error ?? 'unknown'}`);
    return finish(result);
  }

  private async retryDelay(provider: string, error: string | undefined): Promise<void> {
    const code = error?.split(':', 1)[0]?.trim();
    if (!code || !RETRYABLE_CODES.has(code)) return;
    let delayMs = FALLBACK_RETRY_DELAY_MS;
    try {
      const policy = this.ctx.llm.providerRetryPolicy(provider);
      delayMs = Math.min(policy.initialDelayMs, policy.maxDelayMs);
    } catch {
      // policy unreadable → fixed delay
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
