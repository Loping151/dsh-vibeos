import type { WebSocket } from 'ws';
import type { SkinManifest } from '../../shared';
import type { AppSearch } from '../ai/appSearch';
import type { CommandPalette } from '../ai/commandPalette';
import type { ModelPolicy } from '../ai/modelPolicy';
import type { SdkManager } from '../ai/SdkManager';
import type { VibeosBus } from '../agents/bus';
import type { Config } from '../config';
import type { KernelState } from '../kernel/kernelState';
import type { SystemResetService } from '../kernel/reset';
import type { WindowService } from '../kernel/windows';
import type { ImageStore } from '../state/imageStore';
import type { AppRepo } from '../state/repos/AppRepo';
import type { GeometryRepo } from '../state/repos/GeometryRepo';
import type { MemoryRepo } from '../state/repos/MemoryRepo';
import type { NotificationRepo } from '../state/repos/NotificationRepo';
import type { RunRepo } from '../state/repos/RunRepo';
import type { SettingsRepo } from '../state/repos/SettingsRepo';
import type { VfsRepo } from '../state/repos/VfsRepo';
import type { WindowRepo } from '../state/repos/WindowRepo';
import type { SyscallInterpreter } from '../syscall/SyscallInterpreter';
import type { InboundHandler, WsGateway } from './wsGateway';
export interface RouterDeps {
    config: Config;
    version: string;
    gateway: WsGateway;
    bus: VibeosBus;
    kernelState: KernelState;
    settings: SettingsRepo;
    apps: AppRepo;
    windows: WindowRepo;
    windowService: WindowService;
    memory: MemoryRepo;
    vfs: VfsRepo;
    notifications: NotificationRepo;
    runs: RunRepo;
    geometry: GeometryRepo;
    sdk: SdkManager;
    policy: ModelPolicy;
    syscalls: SyscallInterpreter;
    appSearch: AppSearch;
    commandPalette: CommandPalette;
    imageStore: ImageStore;
    reset: SystemResetService;
    /** Built-ins (css '') + validated config custom skins, for boot.state. */
    skins: readonly SkinManifest[];
}
export declare class VibeosRouter implements InboundHandler {
    private readonly deps;
    /** The latest in-flight app search per connection, so a new query preempts it. */
    private readonly appSearchAborts;
    /** The latest in-flight command per connection, so a new command preempts it. */
    private readonly commandAborts;
    constructor(deps: RouterDeps);
    handleMessage(ws: WebSocket, raw: string): Promise<void>;
    handleClose(ws: WebSocket): void;
    private dispatch;
    /** Single-slot undo/redo: abort the window's in-flight run, swap snapshots. */
    private handleHistorySwap;
    private handleOpen;
    private handleSettingsUpdate;
    private handleWallpaperUpload;
    private handleNotificationClick;
    /** Spawn a fresh window (or desktop widget) and generate its content live. */
    private handleAppLaunch;
    /** Freeze a window's current UI as a reusable installed app (+ desktop shortcut). */
    private handleAppSave;
    /** Export an installed app to a shareable .vibeapp file on the desktop. */
    private handleAppExport;
    /** Import an app from a .vibeapp JSON string. */
    private handleAppUninstall;
    private handleAppImport;
    /** The whole restore story: full desktop state replayed on every (re)connect. */
    private sendBootState;
}
