/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — packages/shared/src/protocol/server-to-client.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): models.updated / providers.updated / provider.models collapse
 * into models.info, agent.event dropped, boot state carries skins + effective models + features.
 * Original license: MIT. */

import type { AgentRun } from '../domain/agent';
import type { AppDescriptor } from '../domain/app';
import type { EffectiveModels, CatalogProvider } from '../domain/models';
import type { Notification } from '../domain/notification';
import type { Settings } from '../domain/settings';
import type { SkinManifest } from '../domain/skin';
import type { VfsNode } from '../domain/vfs';
import type { WindowState } from '../domain/window';

export type BootPhase = 'connecting' | 'restoring' | 'ready';

export interface AppSearchResult {
  name: string;
  /** Short tagline describing the app. */
  description: string;
  /** Icon hint from the client icon vocabulary. */
  icon: string;
  /** Whether this is best as a full app or a glanceable desktop widget. */
  kind: 'app' | 'widget';
}

export interface BootStatePayload {
  phase: 'ready';
  version: string;
  bootCount: number;
  settings: Settings;
  windows: WindowState[];
  apps: AppDescriptor[];
  desktopNodes: VfsNode[];
  recycleBinNodes: VfsNode[];
  /** Last 50. */
  notifications: Notification[];
  globalState: Record<string, unknown>;
  /** Current snapshots for already-open windows, keyed by windowId. */
  snapshots: Record<string, string>;
  /** Last 50 agent runs for the Activity Monitor. */
  agentRuns: AgentRun[];
  /** Built-ins (css empty) + config custom skins (css inline). */
  skins: SkinManifest[];
  effective: EffectiveModels;
  features: {
    imageGen: false;
    classicDefault: boolean;
    bridgeDshTheme: boolean;
    /** Preset/app ids pinned as launchers on the taskbar. */
    pinnedApps: string[];
    /** Idle delay before spotlight queries the model. */
    searchDebounceMs: number;
    /** Default terminal prompt identity (settings may override). */
    terminalPrompt: string;
  };
}

export interface UiRegion {
  /** data-vibeos-region id. */
  region: string;
  html: string;
}

export interface UiPatchPayload {
  windowId: string;
  mode: 'full' | 'regions';
  html?: string;
  /** Sandboxed applet document (real JS); replaces html when present. */
  applet?: string;
  regions?: UiRegion[];
  /** true while streaming partial content. */
  streaming?: boolean;
  /** true on the final frame for this op. */
  done?: boolean;
}

/** Stable keys the client localizes as `error.<code>`. */
export type WireErrorCode =
  | 'bad_json'
  | 'bad_message'
  | 'internal'
  | 'no_app'
  | 'ai_failed'
  | 'wallpaper_bad_image';

export type ServerToClient =
  | { type: 's2c.boot.state'; payload: BootStatePayload }
  | { type: 's2c.boot.ready'; payload: Record<string, never> }
  | { type: 's2c.ui.patch'; payload: UiPatchPayload }
  | { type: 's2c.ui.busy'; payload: { windowId: string; busy: boolean } }
  | { type: 's2c.window.opened'; payload: { window: WindowState } }
  | { type: 's2c.window.closed'; payload: { windowId: string } }
  | { type: 's2c.window.focused'; payload: { windowId: string } }
  | { type: 's2c.window.moved'; payload: { window: WindowState } }
  | { type: 's2c.window.stateChanged'; payload: { window: WindowState } }
  | { type: 's2c.window.reordered'; payload: { ids: string[] } }
  | { type: 's2c.syscall.notify'; payload: { notification: Notification } }
  | {
      type: 's2c.syscall.appInstalled';
      payload: { app: AppDescriptor; shortcut?: VfsNode };
    }
  | { type: 's2c.syscall.fileCreated'; payload: { node: VfsNode } }
  | { type: 's2c.vfs.changed'; payload: { node: VfsNode } }
  | { type: 's2c.vfs.removed'; payload: { ids: string[] } }
  /** An installed app was uninstalled; nodeIds are its removed shortcuts. */
  | { type: 's2c.app.removed'; payload: { appId: string; nodeIds: string[] } }
  /** Export payload for a real browser download of a .vibeapp file. */
  | { type: 's2c.app.exported'; payload: { name: string; json: string } }
  /** Update a window's native chrome (e.g. browser address bar) — AI -> shell. */
  | { type: 's2c.chrome.set'; payload: { windowId: string; patch: Record<string, string> } }
  | { type: 's2c.agent.run'; payload: { run: AgentRun } }
  | { type: 's2c.activity.page'; payload: { runs: AgentRun[]; hasMore: boolean } }
  | { type: 's2c.settings.changed'; payload: { settings: Settings } }
  | {
      type: 's2c.models.info';
      payload: { effective: EffectiveModels; catalog: CatalogProvider[] };
    }
  | {
      type: 's2c.app.searchResults';
      payload: { requestId: string; results: AppSearchResult[] };
    }
  /** Result of an AI command-palette command: how many syscalls ran. */
  | {
      type: 's2c.command.result';
      payload: { requestId: string; count: number; error?: string };
    }
  | { type: 's2c.notification.read'; payload: { id: string | 'all' } }
  /** The desktop session was factory-reset; clients drop state and re-hello. */
  | { type: 's2c.system.reset'; payload: Record<string, never> }
  | { type: 's2c.session.exported'; payload: { name: string; json: string } }
  | {
      type: 's2c.session.list';
      payload: { sessions: Array<{ id: string; archivedAt: number; windows: number; apps: number }> };
    }
  | {
      type: 's2c.error';
      // `code` is a stable key localized on the client (error.<code>); `detail`
      // is raw, non-localized context (e.g. a provider error string, an app id).
      payload: { code: WireErrorCode | (string & {}); detail?: string; windowId?: string };
    };

export type ServerToClientType = ServerToClient['type'];
export type ServerToClientPayload<T extends ServerToClientType> = Extract<
  ServerToClient,
  { type: T }
>['payload'];
