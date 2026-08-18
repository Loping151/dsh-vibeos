import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { Domain } from '@deepseek-ai/dsh-storage-domain';
import type { AgentRun, AppDescriptor, AppMemory, Notification, Rect, Settings, VfsNode, WindowState } from '../../shared';
/** Storage unit names must match /^[a-z][a-z0-9_]*$/ — hyphens throw at defineDomain. */
export declare const CORE_DOMAIN_NAME = "vibeos_core";
export declare const MEMORY_DOMAIN_NAME = "vibeos_memory";
export declare const ACTIVITY_DOMAIN_NAME = "vibeos_activity";
export declare const ARCHIVE_DOMAIN_NAME = "vibeos_archive";
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
export declare const SettingsSchema: z.ZodType<Settings>;
export declare const KernelSchema: z.ZodType<KernelRecord>;
export declare const AppRecordSchema: z.ZodType<AppRecord>;
export declare const WindowRecordSchema: z.ZodType<WindowRecord>;
export declare const VfsRecordSchema: z.ZodType<VfsRecord>;
export declare const RectRecordSchema: z.ZodType<RectRecord>;
export declare const AppMemoryRecordSchema: z.ZodType<AppMemoryRecord>;
export declare const InteractionListRecordSchema: z.ZodType<InteractionListRecord>;
export declare const NotificationSchema: z.ZodType<Notification>;
export declare const AgentRunSchema: z.ZodType<AgentRunRecord>;
/** Small, low-frequency state: settings, kernel, apps, open windows, VFS, geometry. */
export declare const CORE: {
    name: string;
    version: number;
    global: {
        schema: z.ZodObject<{
            settings: z.ZodType<Settings, unknown, z.core.$ZodTypeInternals<Settings, unknown>>;
            kernel: z.ZodType<KernelRecord, unknown, z.core.$ZodTypeInternals<KernelRecord, unknown>>;
        }, z.core.$strip>;
        initial: {
            settings: Settings;
            kernel: KernelRecord;
        };
    };
    tables: {
        apps: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, AppDescriptor>;
        windows: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, WindowState>;
        vfs: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, VfsNode>;
        geometry: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, RectRecord>;
    };
};
/** Large, hot state kept apart so a notification never rewrites HTML snapshots. */
export declare const MEMORY: {
    name: string;
    version: number;
    tables: {
        memory: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, AppMemory>;
        interactions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, InteractionListRecord>;
    };
};
/** Notifications + agent-run history. */
export declare const ACTIVITY: {
    name: string;
    version: number;
    global: {
        schema: z.ZodObject<{
            notifications: z.ZodArray<z.ZodType<Notification, unknown, z.core.$ZodTypeInternals<Notification, unknown>>>;
        }, z.core.$strip>;
        initial: {
            notifications: never[];
        };
    };
    tables: {
        runs: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, AgentRun>;
    };
};
/** Archived desktop sessions (restart keeps the last few restorable). */
export declare const ArchiveRecordSchema: z.ZodObject<{
    id: z.ZodString;
    archivedAt: z.ZodNumber;
    windows: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    apps: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    vfs: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    geometry: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    memory: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    interactions: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    globalState: z.ZodCatch<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type ArchiveRecord = z.infer<typeof ArchiveRecordSchema>;
export declare const ARCHIVE: {
    name: string;
    version: number;
    tables: {
        archives: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            id: string;
            archivedAt: number;
            windows: Record<string, unknown>;
            apps: Record<string, unknown>;
            vfs: Record<string, unknown>;
            geometry: Record<string, unknown>;
            memory: Record<string, unknown>;
            interactions: Record<string, unknown>;
            globalState: Record<string, unknown>;
        }>;
    };
};
export type ArchiveHandle = DomainHandle<typeof ARCHIVE>;
/**
 * Single-writer lane per domain (port of VibeOS's writeQueue): read-modify-write
 * sequences inside a repo can never interleave with another repo's.
 */
export type Enqueue = <T>(fn: () => T | Promise<T>) => Promise<T>;
export interface DomainHandle<S extends typeof CORE | typeof MEMORY | typeof ACTIVITY | typeof ARCHIVE> {
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
export declare function openDomains(ctx: Context, namespace?: string): Promise<VibeosDomains>;
