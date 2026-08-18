/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/protocol/client-to-server.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): provider.scan / provider.fetchModels / wallpaper.generate
 * dropped, models.list added. Original license: MIT. */

import type { Settings } from '../domain/settings';
import type { ModelRef } from '../domain/models';
import type { VfsLocation } from '../domain/vfs';

/** A delegated event from inside an AI-generated window surface. */
export interface AiOp {
  kind: 'click' | 'input' | 'submit' | 'change' | 'key' | 'custom';
  /** The data-vibeos-action value of the target element. */
  action?: string;
  /** CSS selector or stable ref to the target (best-effort). */
  sel?: string;
  /** data-* attributes collected from the target. */
  dataset?: Record<string, string>;
  /** Current value for input/change. */
  value?: string;
  /** Serialized form fields for submit. */
  formData?: Record<string, string>;
}

export type DragPayloadKind = 'text' | 'image' | 'file' | 'desktop-object' | 'app-shortcut';

export interface DragPayload {
  kind: DragPayloadKind;
  /** id (vfs node / app) or literal value (text/image url). */
  ref: string;
  label?: string;
}

export interface DropTarget {
  /** Window receiving the drop, or undefined for desktop. */
  windowId?: string;
  action?: string;
  sel?: string;
}

/** Settings update: like Partial<Settings>, but a per-role modelOverrides
 * entry may be null to clear that override back to the default. */
export type SettingsPatch = Omit<Partial<Settings>, 'modelOverrides'> & {
  modelOverrides?: { ui?: ModelRef | null; fast?: ModelRef | null };
};

export type ClientToServer =
  | { type: 'c2s.boot.hello'; payload: { clientId?: string } }
  | { type: 'c2s.op'; payload: { windowId: string; op: AiOp } }
  | {
      type: 'c2s.op.dragdrop';
      payload: { windowId?: string; source: DragPayload; target: DropTarget };
    }
  | { type: 'c2s.window.open'; payload: { appId: string; hint?: string } }
  | { type: 'c2s.window.close'; payload: { windowId: string } }
  | { type: 'c2s.window.focus'; payload: { windowId: string } }
  | { type: 'c2s.window.minimize'; payload: { windowId: string } }
  | { type: 'c2s.window.maximize'; payload: { windowId: string } }
  | {
      type: 'c2s.window.move';
      payload: { windowId: string; x: number; y: number; w: number; h: number };
    }
  | { type: 'c2s.window.reorder'; payload: { ids: string[] } }
  /** Single-step undo/redo of a window's last AI content change. */
  | { type: 'c2s.window.undo'; payload: { windowId: string } }
  | { type: 'c2s.window.redo'; payload: { windowId: string } }
  | {
      type: 'c2s.vfs.move';
      payload: {
        nodeId: string;
        location: VfsLocation;
        x?: number;
        y?: number;
        parentId?: string;
      };
    }
  | { type: 'c2s.vfs.open'; payload: { nodeId: string } }
  | { type: 'c2s.vfs.delete'; payload: { nodeId: string } }
  | { type: 'c2s.vfs.empty'; payload: Record<string, never> }
  | { type: 'c2s.settings.update'; payload: { partial: SettingsPatch } }
  | { type: 'c2s.app.uninstall'; payload: { appId: string } }
  /** Set the desktop wallpaper from an uploaded image (a data: URL). */
  | { type: 'c2s.wallpaper.upload'; payload: { dataUrl: string } }
  | { type: 'c2s.notification.read'; payload: { id: string | 'all' } }
  | { type: 'c2s.notification.click'; payload: { id: string } }
  /** Spotlight-style app search: AI returns a list of candidate apps. */
  | { type: 'c2s.app.search'; payload: { query: string; requestId: string } }
  /** AI command palette: a natural-language instruction the AI turns into syscalls. */
  | { type: 'c2s.command.run'; payload: { text: string; requestId: string } }
  /** Launch a (possibly brand-new) app in a fresh window, generated live. */
  | {
      type: 'c2s.app.launch';
      payload: { name: string; description?: string; icon?: string; widget?: boolean };
    }
  /** Freeze a window's current UI as a reusable installed app (+ desktop shortcut). */
  | { type: 'c2s.app.save'; payload: { windowId: string; name?: string; icon?: string } }
  /** Export an installed app to a shareable .vibeapp file on the desktop. */
  | { type: 'c2s.app.export'; payload: { appId: string } }
  /** Import an app from a .vibeapp JSON string. */
  | { type: 'c2s.app.import'; payload: { json: string } }
  | { type: 'c2s.activity.fetch'; payload: { before?: number; limit?: number } }
  | { type: 'c2s.activity.stop'; payload: { runId: string } }
  /** Ask for the resolved role models + the DSH provider/model catalog. */
  | { type: 'c2s.models.list'; payload: Record<string, never> }
  /** Factory-reset the desktop session (settings are kept). */
  | { type: 'c2s.system.reset'; payload: Record<string, never> }
  | { type: 'c2s.session.list'; payload: Record<string, never> }
  | { type: 'c2s.session.restore'; payload: { id: string } }
  | { type: 'c2s.session.export'; payload: { id: string } }
  | { type: 'c2s.session.import'; payload: { json: string } };

export type ClientToServerType = ClientToServer['type'];
export type ClientToServerPayload<T extends ClientToServerType> = Extract<
  ClientToServer,
  { type: T }
>['payload'];
