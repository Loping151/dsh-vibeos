import type { AppDescriptor, AppManifest } from '../../../shared';
import type { CoreHandle } from '../domains';
/**
 * Hidden anchor app for AI-spawned popup windows not tied to a real installed
 * app. Never listed (isInstalled = false).
 */
export declare const TRANSIENT_APP_ID = "__transient__";
export declare class AppRepo {
    private readonly core;
    private readonly table;
    constructor(core: CoreHandle);
    listApps(): AppDescriptor[];
    getApp(id: string): AppDescriptor | null;
    private findByPreset;
    /** Idempotent by preset id; existing rows get name/icon/manifest refreshed from code. */
    seedPresets(): Promise<void>;
    /** Hard-delete an installed (non-preset) app row. */
    removeApp(appId: string): Promise<boolean>;
    installApp(input: {
        name: string;
        icon?: string;
        manifest?: AppManifest;
    }): Promise<AppDescriptor>;
    clearAll(): Promise<void>;
    ensureTransientApp(): Promise<string>;
}
