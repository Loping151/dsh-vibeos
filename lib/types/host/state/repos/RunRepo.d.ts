import type { AgentRole, AgentRun, AgentRunStatus, AgentTrigger } from '../../../shared';
import type { ActivityHandle } from '../domains';
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
export declare class RunRepo {
    private readonly activity;
    private readonly table;
    constructor(activity: ActivityHandle);
    getRun(id: string): AgentRun | undefined;
    startRun(input: StartRunInput): Promise<AgentRun>;
    endRun(id: string, status: AgentRunStatus, error?: string, usage?: RunUsage): Promise<AgentRun | undefined>;
    setSummary(id: string, summary: string): Promise<AgentRun | undefined>;
    /** Newest runs first. */
    recentRuns(limit?: number): AgentRun[];
    /** `before` is a startedAt cursor for scroll pagination. */
    page(before?: number, limit?: number): {
        runs: AgentRun[];
        hasMore: boolean;
    };
    clearAll(): Promise<void>;
    prune(keep?: number): Promise<void>;
}
