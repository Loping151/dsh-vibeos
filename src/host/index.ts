/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/index.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): the Bun server entry becomes a cordis plugin whose
 * apply() boots the kernel; hard inject fails loud if a platform service is missing.
 * Original license: MIT. */

import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './config';
import { boot } from './kernel/boot';

export const name = 'dsh-vibeos';
export const inject = ['webServer', 'storageDomain', 'llm', 'timer', 'agentDefaultModel'];
export { Config } from './config';

export async function apply(ctx: Context, config: Config): Promise<void> {
  await boot(ctx, config);
}
