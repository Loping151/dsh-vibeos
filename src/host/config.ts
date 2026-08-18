import Schema from 'schemastery';

/* Schema frozen by ARCHITECTURE.md §B.2. Workstream E owns boot-time normalization. */

export interface ModelRefConfig {
  provider?: string;
  model?: string;
}

export interface CustomSkinEntry {
  name: string;
  label?: string;
  css: string;
  dswTokens?: Record<string, { light: string; dark: string }>;
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

export const Config: Schema<Config> = Schema.object({
  ui: Schema.object({
    model: Schema.object({ provider: Schema.string(), model: Schema.string() }).description(
      'UI-generation (strong) model; both-or-neither. Default: ctx.agentDefaultModel.currentSelection()',
    ),
    reasoningEffort: Schema.union(['off', 'low', 'high', 'max']).default('off'),
    genTimeoutMs: Schema.natural().default(180_000),
    snapshotBudget: Schema.natural().default(0),
    maxTokens: Schema.natural().default(16_000),
  }).default({} as never),
  fast: Schema.object({
    model: Schema.object({ provider: Schema.string(), model: Schema.string() }).description(
      'Ambient/system-event/maintenance/search model. Recommend deepseek-v4-flash. Default: same as ui.',
    ),
    reasoningEffort: Schema.union(['off', 'low', 'high', 'max']).default('off'),
    maxTokens: Schema.natural().default(4_000),
  }).default({} as never),
  agents: Schema.object({
    enabled: Schema.boolean().default(true),
    proactive: Schema.boolean().default(true),
    systemEventIntervalMs: Schema.natural().default(75_000),
    maintenanceIntervalMs: Schema.natural().default(300_000),
    runHistory: Schema.natural().default(500),
  }).default({} as never),
  skins: Schema.object({
    default: Schema.string().default('devdock'),
    custom: Schema.array(
      Schema.object({
        name: Schema.string().pattern(/^[a-z][a-z0-9-]*$/).required(),
        label: Schema.string(),
        css: Schema.string().role('textarea').required(),
        dswTokens: Schema.dict(
          Schema.object({ light: Schema.string(), dark: Schema.string() }),
        ),
      }),
    ).default([]),
    bridgeDshTheme: Schema.boolean().default(true),
  }).default({} as never),
  desktop: Schema.object({
    startInClassicMode: Schema.boolean().default(false),
    pinnedApps: Schema.array(Schema.string()).default([
      'browser',
      'file-manager',
      'command-line',
      'settings',
    ]),
    searchDebounceMs: Schema.natural().default(1000),
  }).default({} as never),
  storage: Schema.object({
    namespace: Schema.string().pattern(/^[a-z0-9_]{0,16}$/).default(''),
  }).default({} as never),
  web: Schema.object({
    enabled: Schema.boolean().default(true),
    timeoutMs: Schema.natural().default(12_000),
    maxChars: Schema.natural().default(6_000),
    maxCalls: Schema.natural().default(3),
  }).default({} as never),
  terminal: Schema.object({
    prompt: Schema.string()
      .default('dev@vibeos')
      .description('Terminal prompt identity, e.g. "you@laptop"; overridable in Settings.'),
  }).default({} as never),
  locale: Schema.union(['zh', 'en']).default('zh'),
  wallpaperMaxBytes: Schema.natural().default(4_000_000),
  aiStub: Schema.boolean().default(false),
}) as unknown as Schema<Config>;
