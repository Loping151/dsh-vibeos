/** Client bundle entry: wires the takeover, the ws→store boot dispatch and the
 * DSH theme bridge, and exposes the public `vibeos` registry API. Everything is
 * reverted through the fiber effect (classic toggle, HMR drain, plugin disable). */
import type { Context } from '@deepseek-ai/cordis';
export { vibeos, type VibeosClientApi } from './registry/index';
export declare const inject: string[];
export declare function apply(ctx: Context): void;
