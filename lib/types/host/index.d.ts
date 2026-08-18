import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './config';
export declare const name = "dsh-vibeos";
export declare const inject: string[];
export { Config } from './config';
export declare function apply(ctx: Context, config: Config): Promise<void>;
