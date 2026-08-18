import type { Context } from '@deepseek-ai/cordis';
import type { AgentRole, AgentTrigger, Settings } from '../../shared';
import type { Config } from '../config';
import type { WsGateway } from '../gateway/wsGateway';
import type { RunRepo } from '../state/repos/RunRepo';
import type { ModelPolicy } from './modelPolicy';
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
    onToolCall?: (name: string, argsJson: string) => Promise<{
        text: string;
        isError: boolean;
    }>;
    maxToolCalls?: number;
}
export interface RunResult {
    text: string;
    ok: boolean;
    error?: string;
    runId?: string;
    usage?: import('./llmClient').UsageTotals;
}
/**
 * The single seam between the OS and the model. Resolves the role's model +
 * localized system prompt, tracks the run for the Activity Monitor, handles
 * stub mode, then streams through ctx.llm. Callers never see the provider.
 */
export declare class SdkManager {
    private readonly ctx;
    private readonly config;
    private readonly policy;
    private readonly runs;
    private readonly gateway;
    private readonly getSettings;
    /** Live runs by id → their abort controller, so the UI can stop one. */
    private readonly runRegistry;
    /** Runs the user explicitly stopped (recorded as "aborted", not "error"). */
    private readonly stoppedRuns;
    constructor(ctx: Context, config: Config, policy: ModelPolicy, runs: RunRepo, gateway: Pick<WsGateway, 'broadcast'>, getSettings: () => Settings);
    /** Abort an in-flight run by id (Activity Monitor "Stop"). */
    stopRun(runId: string): void;
    /** Attach a one-line summary of what a run produced, and re-broadcast it. */
    recordSummary(runId: string | undefined, summary: string): void;
    run(opts: RunOptions): Promise<RunResult>;
    private retryDelay;
}
