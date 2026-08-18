import type { Context } from '@deepseek-ai/cordis';
import type { Config } from '../config';
export declare const WS_PATH = "/vibeos/ws";
export declare function boot(ctx: Context, config: Config): Promise<void>;
