/** Model-facing web tools for UI generation, backed by the DSH web seam
 * (ctx.web: search + fetch providers, credentials handled by the harness).
 * The service is optional — absent providers simply disable the tools. */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
export interface WebToolConfig {
    enabled: boolean;
    timeoutMs: number;
    maxChars: number;
    maxCalls: number;
}
export declare const WEB_TOOL_SCHEMAS: ToolSchema[];
/** Strip an HTML document down to a readable digest the model can rebuild from. */
export declare function htmlDigest(html: string, maxChars: number): string;
export declare class WebToolRuntime {
    private readonly ctx;
    private readonly cfg;
    constructor(ctx: Context, cfg: WebToolConfig);
    available(): boolean;
    get maxCalls(): number;
    exec(name: string, argsJson: string): Promise<{
        text: string;
        isError: boolean;
    }>;
}
