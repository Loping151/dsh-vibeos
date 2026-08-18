import type { Context } from '@deepseek-ai/cordis';
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
export interface LlmRunOptions {
    system: string;
    prompt: string;
    provider: string;
    model: string;
    reasoningEffort?: 'off' | 'low' | 'high' | 'max';
    maxTokens?: number;
    onDelta?: (text: string) => void;
    abort: AbortController;
    /** Model-callable tools; rounds are bounded by maxToolCalls. */
    tools?: ToolSchema[];
    onToolCall?: (name: string, argsJson: string) => Promise<{
        text: string;
        isError: boolean;
    }>;
    maxToolCalls?: number;
}
export interface LlmRunResult {
    text: string;
    ok: boolean;
    error?: string;
    usage?: UsageTotals;
}
export interface UsageTotals {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
}
/**
 * Contract (frozen): abort/preemption → ok:false with NO error; a finish
 * error with non-empty streamed text is salvaged as ok:true.
 * Tool rounds: on finish kind 'tool-calls' the calls are executed and the
 * loop continues; the returned text is the FINAL round's text.
 */
export declare function runLlm(ctx: Context, o: LlmRunOptions): Promise<LlmRunResult>;
