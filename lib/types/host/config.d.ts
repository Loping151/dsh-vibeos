import Schema from 'schemastery';
export interface ModelRefConfig {
    provider?: string;
    model?: string;
}
export interface CustomSkinEntry {
    name: string;
    label?: string;
    css: string;
    dswTokens?: Record<string, {
        light: string;
        dark: string;
    }>;
}
export interface Config {
    ui: {
        model: ModelRefConfig;
        reasoningEffort: 'off' | 'low' | 'high' | 'max';
        genTimeoutMs: number;
        snapshotBudget: number;
        maxTokens: number;
    };
    fast: {
        model: ModelRefConfig;
        reasoningEffort: 'off' | 'low' | 'high' | 'max';
        maxTokens: number;
    };
    agents: {
        enabled: boolean;
        proactive: boolean;
        systemEventIntervalMs: number;
        maintenanceIntervalMs: number;
        runHistory: number;
    };
    skins: {
        default: string;
        custom: CustomSkinEntry[];
        bridgeDshTheme: boolean;
    };
    desktop: {
        startInClassicMode: boolean;
        pinnedApps: string[];
        searchDebounceMs: number;
    };
    storage: {
        namespace: string;
    };
    web: {
        enabled: boolean;
        timeoutMs: number;
        maxChars: number;
        maxCalls: number;
    };
    terminal: {
        prompt: string;
    };
    locale: 'zh' | 'en';
    wallpaperMaxBytes: number;
    aiStub: boolean;
}
export declare const Config: Schema<Config>;
