/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/kernel/kernelState.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): repos are injected instead of module singletons.
 * Original license: MIT. */

import type { KernelRepo } from '../state/repos/KernelRepo';
import type { SettingsRepo } from '../state/repos/SettingsRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';

/**
 * In-memory mirror of the global system state the AI gets to "see".
 * Write-through to storage. Kept compact — it goes into every prompt.
 */
export class KernelState {
  bootCount = 0;
  private global: Record<string, unknown> = {};

  constructor(
    private readonly kernel: KernelRepo,
    private readonly windows: WindowRepo,
    private readonly settings: SettingsRepo,
  ) {}

  load(): void {
    const k = this.kernel.loadKernel();
    this.bootCount = k.bootCount;
    this.global = k.globalState;
  }

  setBootCount(n: number): void {
    this.bootCount = n;
  }

  get(): Record<string, unknown> {
    return this.global;
  }

  async patch(partial: Record<string, unknown>): Promise<void> {
    this.global = { ...this.global, ...partial };
    await this.kernel.saveGlobalState(this.global);
  }

  /** Compact snapshot for the prompt: time, theme, open windows. */
  snapshotForPrompt(): Record<string, unknown> {
    const openWindows = this.windows.listOpenWindows().map((w) => ({
      windowId: w.id,
      appId: w.appId,
      title: w.title,
      state: w.state,
    }));
    return {
      bootCount: this.bootCount,
      now: new Date().toISOString(),
      theme: this.settings.loadSettings().theme,
      openWindows,
      ...this.global,
    };
  }
}
