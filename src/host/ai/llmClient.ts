/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/ai/providers/ (run contract).
 * Adapted for DeepSeek Harness (dsh-vibeos): the whole provider registry collapses onto ctx.llm.stream,
 * plus a bounded tool loop so the model can ground UI in real web data. Original license: MIT. */

import type { Context } from '@deepseek-ai/cordis';
import type {
  FinishReason,
  GenerateOptions,
  Message,
  TokenUsage,
  ToolCallBlock,
  ToolSchema,
} from '@deepseek-ai/dsh-llm';
import {
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
} from '@deepseek-ai/dsh-llm/message';

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
  onToolCall?: (name: string, argsJson: string) => Promise<{ text: string; isError: boolean }>;
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
export async function runLlm(ctx: Context, o: LlmRunOptions): Promise<LlmRunResult> {
  const messages: Message[] = [
    createUserMessage({
      content: [{ type: 'text', text: o.prompt }],
      source: { kind: 'plugin', plugin: 'dsh-vibeos' },
    }),
  ];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, seen: false };
  let calls = 0;
  const maxCalls = o.maxToolCalls ?? 3;

  for (;;) {
    const options: GenerateOptions & { signal: AbortSignal } = {
      provider: o.provider,
      model: o.model,
      reasoningEffort: o.reasoningEffort as GenerateOptions['reasoningEffort'],
      messages,
      system: o.system,
      maxTokens: o.maxTokens,
      ...(o.tools?.length && calls < maxCalls ? { tools: o.tools } : {}),
      signal: o.abort.signal,
    };
    let text = '';
    const toolCalls: ToolCallBlock[] = [];
    let usage: TokenUsage | undefined;
    let finish: FinishReason = { kind: 'stop' };
    for await (const chunk of ctx.llm.stream(options)) {
      if (chunk.type === 'text-delta') {
        text += chunk.text;
        o.onDelta?.(chunk.text);
      } else if (chunk.type === 'block-end' && chunk.block.type === 'tool-call') {
        toolCalls.push(chunk.block);
      } else if (chunk.type === 'usage') {
        usage = chunk.usage;
      } else if (chunk.type === 'finish') {
        finish = chunk.reason;
      }
    }
    if (usage) {
      totals.seen = true;
      // inputTokens excludes cache reads; the billed total folds them back in.
      totals.input += usage.inputTokens + (usage.cacheReadTokens ?? 0);
      totals.output += usage.outputTokens;
      totals.cacheRead += usage.cacheReadTokens ?? 0;
      totals.cacheWrite += usage.cacheWriteTokens ?? 0;
      totals.reasoning += usage.reasoningTokens ?? 0;
    }

    if (finish.kind === 'aborted') return { text, ok: false };
    if (finish.kind === 'tool-calls' && toolCalls.length && o.onToolCall && calls < maxCalls) {
      messages.push(
        createAssistantMessage({
          content: [...(text ? [{ type: 'text' as const, text }] : []), ...toolCalls],
          source: { provider: o.provider, model: o.model },
        }),
      );
      for (const call of toolCalls) {
        calls++;
        const result =
          calls <= maxCalls
            ? await o.onToolCall(call.name, call.arguments)
            : { text: 'tool budget exhausted', isError: true };
        messages.push(
          createToolResultMessage({
            callId: call.id,
            content: [{ type: 'text', text: result.text }],
            isError: result.isError,
          }),
        );
      }
      continue;
    }
    if (finish.kind === 'error') {
      return {
        text,
        ok: text.length > 0,
        error: text ? undefined : `${finish.failure.code}: ${finish.failure.message}`,
        usage: sumUsage(totals),
      };
    }
    return { text, ok: true, usage: sumUsage(totals) };
  }
}

/** VibeOS inputTokens = billed input, so cache reads fold back in. */
function sumUsage(t: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  seen: boolean;
}): LlmRunResult['usage'] {
  if (!t.seen) return undefined;
  return {
    inputTokens: t.input,
    outputTokens: t.output,
    cacheReadTokens: t.cacheRead,
    cacheWriteTokens: t.cacheWrite,
    reasoningTokens: t.reasoning,
  };
}
