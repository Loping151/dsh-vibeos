/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/domain/memory.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos). Original license: MIT. */

export interface AppMemory {
  windowId: string;
  appId: string;
  /** The current rendered HTML body of the window (AI-generated). */
  htmlSnapshot: string;
  /** Single-slot undo history: the snapshot before the last change. */
  prevSnapshot?: string;
  /** Rolling one-paragraph episode summary, maintained by the AI. */
  episodeSummary: string;
  updatedAt: number;
}

export interface Interaction {
  id: string;
  windowId: string;
  seq: number;
  opKind: string;
  opPayload: unknown;
  resultSummary?: string;
  createdAt: number;
}
