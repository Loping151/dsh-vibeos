/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/db/migrations/0001_init.sql
 * (+ 0002-0009) and apps/backend/src/db/repositories/writeQueue.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): the SQLite schema becomes three DSH storage domains.
 * Original license: MIT. */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { Domain } from '@deepseek-ai/dsh-storage-domain';
import type {
  AgentRun,
  AppDescriptor,
  AppManifest,
  AppMemory,
  Notification,
  Rect,
  Settings,
  VfsNode,
  WindowState,
} from '../../shared';
import { DEFAULT_SETTINGS } from '../../shared';

/** Storage unit names must match /^[a-z][a-z0-9_]*$/ — hyphens throw at defineDomain. */
export const CORE_DOMAIN_NAME = 'vibeos_core';
export const MEMORY_DOMAIN_NAME = 'vibeos_memory';
export const ACTIVITY_DOMAIN_NAME = 'vibeos_activity';
export const ARCHIVE_DOMAIN_NAME = 'vibeos_archive';

export type AppRecord = AppDescriptor;
export type WindowRecord = WindowState;
export type VfsRecord = VfsNode;
export type AppMemoryRecord = AppMemory;
export type AgentRunRecord = AgentRun;

/** Remembered per-app window geometry (keyed by appId). */
export interface RectRecord extends Rect {
  updatedAt: number;
}

/** Stored interaction; `opPayload` is free-form JSON. */
export interface InteractionRecord {
  id: string;
  windowId: string;
  seq: number;
  opKind: string;
  opPayload?: unknown;
  resultSummary?: string;
  createdAt: number;
}

/** One row per window: the append-only op log, capped. */
export interface InteractionListRecord {
  windowId: string;
  items: InteractionRecord[];
}

export interface KernelRecord {
  bootCount: number;
  lastBootAt: number;
  globalState: Record<string, unknown>;
  /** Desktop-session marker: backfilled at boot, rotated on system reset. */
  sessionId?: string;
}

export interface CoreGlobal {
  settings: Settings;
  kernel: KernelRecord;
}

export interface ActivityGlobal {
  notifications: Notification[];
}

const sizeSchema = z.object({ w: z.number(), h: z.number() });
const rectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const modelRefSchema = z.object({ provider: z.string(), model: z.string() });

const manifestSchema: z.ZodType<AppManifest> = z
  .looseObject({
    description: z.string().optional(),
    category: z.string().optional(),
    defaultSize: sizeSchema.optional(),
    minSize: sizeSchema.optional(),
    chrome: z.string().optional(),
    singleInstance: z.boolean().optional(),
    seedHtml: z.string().optional(),
  })
  .catch({});

export const SettingsSchema: z.ZodType<Settings> = z.object({
  theme: z.enum(['light', 'dark']),
  skin: z.string().optional(),
  locale: z.enum(['zh', 'en']).optional(),
  userProfile: z.string().optional(),
  modelOverrides: z
    .object({ ui: modelRefSchema.optional(), fast: modelRefSchema.optional() })
    .catch({}),
  prefs: z
    .looseObject({
      proactiveAgents: z.boolean().optional(),
      wallpaper: z.string().optional(),
      classicMode: z.boolean().optional(),
      bridgeDshTheme: z.boolean().optional(),
    })
    .catch({}),
  updatedAt: z.number(),
});

export const KernelSchema: z.ZodType<KernelRecord> = z.object({
  bootCount: z.number(),
  lastBootAt: z.number(),
  globalState: z.record(z.string(), z.unknown()).catch({}),
  sessionId: z.string().optional(),
});

export const AppRecordSchema: z.ZodType<AppRecord> = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['preset', 'virtual']),
  presetId: z
    .enum([
      'browser',
      'command-line',
      'file-manager',
      'settings',
      'activity-monitor',
      'app-store',
      'recycle-bin',
      'welcome',
    ])
    .optional(),
  icon: z.string(),
  manifest: manifestSchema,
  isInstalled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const WindowRecordSchema: z.ZodType<WindowRecord> = z.object({
  id: z.string(),
  appId: z.string(),
  title: z.string(),
  kind: z.enum(['app', 'system', 'widget']),
  rect: rectSchema,
  z: z.number(),
  state: z.enum(['normal', 'minimized', 'maximized']),
  isOpen: z.boolean(),
  focused: z.boolean(),
  order: z.number(),
  openedAt: z.number(),
  updatedAt: z.number(),
});

export const VfsRecordSchema: z.ZodType<VfsRecord> = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  name: z.string(),
  type: z.enum(['file', 'folder', 'shortcut']),
  mime: z.string().optional(),
  content: z.string().optional(),
  targetAppId: z.string().optional(),
  location: z.enum(['desktop', 'folder', 'recyclebin']),
  x: z.number().optional(),
  y: z.number().optional(),
  deletedAt: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).catch({}),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const RectRecordSchema: z.ZodType<RectRecord> = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  updatedAt: z.number(),
});

export const AppMemoryRecordSchema: z.ZodType<AppMemoryRecord> = z.object({
  windowId: z.string(),
  appId: z.string(),
  htmlSnapshot: z.string(),
  prevSnapshot: z.string().optional(),
  episodeSummary: z.string(),
  updatedAt: z.number(),
});

export const InteractionListRecordSchema: z.ZodType<InteractionListRecord> = z.object({
  windowId: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      windowId: z.string(),
      seq: z.number(),
      opKind: z.string(),
      opPayload: z.unknown(),
      resultSummary: z.string().optional(),
      createdAt: z.number(),
    }),
  ),
});

export const NotificationSchema: z.ZodType<Notification> = z.object({
  id: z.string(),
  kind: z.enum(['info', 'success', 'warning', 'error']),
  title: z.string(),
  body: z.string().optional(),
  appId: z.string().optional(),
  source: z.enum(['syscall', 'agent', 'system']),
  read: z.boolean(),
  action: z.object({ label: z.string(), openAppId: z.string().optional() }).optional(),
  createdAt: z.number(),
});

export const AgentRunSchema: z.ZodType<AgentRunRecord> = z.object({
  id: z.string(),
  role: z.enum(['ui-generation', 'system-event', 'maintenance']),
  trigger: z.enum(['timer', 'event', 'user']),
  model: z.string().optional(),
  status: z.enum(['running', 'ok', 'error', 'aborted']),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  error: z.string().optional(),
  appName: z.string().optional(),
  summary: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
  provider: z.string().optional(),
});

const INITIAL_KERNEL: KernelRecord = { bootCount: 0, lastBootAt: 0, globalState: {} };

/** Small, low-frequency state: settings, kernel, apps, open windows, VFS, geometry. */
export const CORE = defineDomain({
  name: CORE_DOMAIN_NAME,
  version: 1,
  global: {
    schema: z.object({ settings: SettingsSchema, kernel: KernelSchema }),
    initial: { settings: DEFAULT_SETTINGS, kernel: INITIAL_KERNEL } satisfies CoreGlobal,
  },
  tables: {
    apps: domainTable<string, AppRecord>(AppRecordSchema),
    windows: domainTable<string, WindowRecord>(WindowRecordSchema),
    vfs: domainTable<string, VfsRecord>(VfsRecordSchema),
    geometry: domainTable<string, RectRecord>(RectRecordSchema),
  },
});

/** Large, hot state kept apart so a notification never rewrites HTML snapshots. */
export const MEMORY = defineDomain({
  name: MEMORY_DOMAIN_NAME,
  version: 1,
  tables: {
    memory: domainTable<string, AppMemoryRecord>(AppMemoryRecordSchema),
    interactions: domainTable<string, InteractionListRecord>(InteractionListRecordSchema),
  },
});

/** Notifications + agent-run history. */
export const ACTIVITY = defineDomain({
  name: ACTIVITY_DOMAIN_NAME,
  version: 1,
  global: {
    schema: z.object({ notifications: z.array(NotificationSchema) }),
    initial: { notifications: [] } satisfies ActivityGlobal,
  },
  tables: {
    runs: domainTable<string, AgentRunRecord>(AgentRunSchema),
  },
});

/** Archived desktop sessions (restart keeps the last few restorable). */
export const ArchiveRecordSchema = z.object({
  id: z.string(),
  archivedAt: z.number(),
  windows: z.record(z.string(), z.unknown()),
  apps: z.record(z.string(), z.unknown()),
  vfs: z.record(z.string(), z.unknown()),
  geometry: z.record(z.string(), z.unknown()),
  memory: z.record(z.string(), z.unknown()),
  interactions: z.record(z.string(), z.unknown()),
  globalState: z.record(z.string(), z.unknown()).catch({}),
});
export type ArchiveRecord = z.infer<typeof ArchiveRecordSchema>;

export const ARCHIVE = defineDomain({
  name: ARCHIVE_DOMAIN_NAME,
  version: 1,
  tables: {
    archives: domainTable<string, ArchiveRecord>(ArchiveRecordSchema),
  },
});
export type ArchiveHandle = DomainHandle<typeof ARCHIVE>;

/**
 * Single-writer lane per domain (port of VibeOS's writeQueue): read-modify-write
 * sequences inside a repo can never interleave with another repo's.
 */
export type Enqueue = <T>(fn: () => T | Promise<T>) => Promise<T>;

function createQueue(): Enqueue {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => T | Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export interface DomainHandle<
  S extends typeof CORE | typeof MEMORY | typeof ACTIVITY | typeof ARCHIVE,
> {
  readonly domain: Domain<S>;
  readonly enqueue: Enqueue;
}

export type CoreHandle = DomainHandle<typeof CORE>;
export type MemoryHandle = DomainHandle<typeof MEMORY>;
export type ActivityHandle = DomainHandle<typeof ACTIVITY>;

export interface VibeosDomains {
  readonly core: CoreHandle;
  readonly memory: MemoryHandle;
  readonly activity: ActivityHandle;
  readonly archive: ArchiveHandle;
  closeAll(): Promise<void>;
}

/** Open all three domains; a failure part-way closes whatever already opened.
 * `namespace` isolates a deployment's state (test profiles vs the real one):
 * vibeos_<ns>_core instead of vibeos_core. Must match /^[a-z0-9_]{0,16}$/. */
export async function openDomains(ctx: Context, namespace = ''): Promise<VibeosDomains> {
  if (!/^[a-z0-9_]{0,16}$/.test(namespace)) throw new Error(`bad storage namespace: ${namespace}`);
  const opened: Array<{ close(): Promise<void> }> = [];
  const open = async <S extends typeof CORE | typeof MEMORY | typeof ACTIVITY | typeof ARCHIVE>(
    spec: S,
  ): Promise<DomainHandle<S>> => {
    const named = namespace
      ? { ...spec, name: spec.name.replace(/^vibeos_/, `vibeos_${namespace}_`) }
      : spec;
    const domain = await ctx.storageDomain.open(named);
    opened.push(domain);
    return { domain, enqueue: createQueue() };
  };
  try {
    const core = await open(CORE);
    const memory = await open(MEMORY);
    const activity = await open(ACTIVITY);
    const archive = await open(ARCHIVE);
    return {
      core,
      memory,
      activity,
      archive,
      closeAll: () => closeAll(opened),
    };
  } catch (e) {
    await closeAll(opened);
    throw e;
  }
}

async function closeAll(opened: Array<{ close(): Promise<void> }>): Promise<void> {
  const pending = opened.splice(0, opened.length);
  await Promise.all(pending.map((d) => d.close()));
}
