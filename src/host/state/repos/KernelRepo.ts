/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/repositories/KernelRepo.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): kernel_state becomes half of the vibeos_core global.
 * Original license: MIT. */

import { ulid } from '../../../shared';
import type { CoreHandle, KernelRecord } from '../domains';

export class KernelRepo {
  constructor(private readonly core: CoreHandle) {}

  loadKernel(): KernelRecord {
    return this.core.domain.global.get().kernel;
  }

  recordBoot(): Promise<KernelRecord> {
    return this.core.enqueue(async () => {
      const state = this.core.domain.global.get();
      const kernel: KernelRecord = {
        bootCount: state.kernel.bootCount + 1,
        lastBootAt: Date.now(),
        globalState: state.kernel.globalState,
        sessionId: state.kernel.sessionId ?? ulid(),
      };
      await this.core.domain.global.set({ ...state, kernel });
      return kernel;
    });
  }

  /** System reset: fresh session, first-boot counter, empty global state. */
  resetKernel(): Promise<KernelRecord> {
    return this.core.enqueue(async () => {
      const state = this.core.domain.global.get();
      const kernel: KernelRecord = {
        bootCount: 1,
        lastBootAt: Date.now(),
        globalState: {},
        sessionId: ulid(),
      };
      await this.core.domain.global.set({ ...state, kernel });
      return kernel;
    });
  }

  /** Swap in an archived session's identity + global state (boot count kept). */
  restoreSession(globalState: Record<string, unknown>, sessionId: string): Promise<void> {
    return this.core.enqueue(async () => {
      const state = this.core.domain.global.get();
      await this.core.domain.global.set({
        ...state,
        kernel: { ...state.kernel, globalState, sessionId, lastBootAt: Date.now() },
      });
    });
  }

  saveGlobalState(globalState: Record<string, unknown>): Promise<void> {
    return this.core.enqueue(async () => {
      const state = this.core.domain.global.get();
      await this.core.domain.global.set({
        ...state,
        kernel: { ...state.kernel, globalState },
      });
    });
  }
}
