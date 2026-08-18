/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/events/bus.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): an instance on the runtime, not a module singleton;
 * the never-emitted agent.tick event is dropped. Original license: MIT. */

import { EventEmitter } from 'node:events';
import type { AiOp, DragPayload, DropTarget } from '../../shared';

export interface BusEvents {
  /** A user operation arrived inside a window — drives UI generation. */
  'op.received': { windowId: string; op: AiOp };
  'op.dragdrop': { windowId?: string; source: DragPayload; target: DropTarget };
  /** A window was opened and needs its first AI render. */
  'window.firstRender': { windowId: string };
  /** A window spawned by the AI with a specific seed prompt for its content. */
  'window.spawnRender': { windowId: string; seedPrompt: string };
  /** A window was closed — any in-flight generation for it must be aborted. */
  'window.closed': { windowId: string };
  /** Abort a window's in-flight generation without closing it (undo/redo). */
  'window.abortRender': { windowId: string };
}

export class VibeosBus {
  private readonly ee = new EventEmitter();

  constructor() {
    this.ee.setMaxListeners(50);
  }

  emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void {
    this.ee.emit(type, payload);
  }

  on<K extends keyof BusEvents>(type: K, fn: (payload: BusEvents[K]) => void): () => void {
    this.ee.on(type, fn as (p: unknown) => void);
    return () => this.ee.off(type, fn as (p: unknown) => void);
  }
}
