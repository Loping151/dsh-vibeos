export type ModelRole = 'ui' | 'fast';

export type ReasoningEffort = 'off' | 'low' | 'high' | 'max';

export interface ModelRef {
  provider: string;
  model: string;
}

/** Where a resolved role's model came from: settings override, plugin config, or ctx.agentDefaultModel. */
export type ModelSource = 'settings' | 'config' | 'default';

export interface ResolvedRole {
  provider: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  source: ModelSource;
}

export interface EffectiveModels {
  ui: ResolvedRole;
  fast: ResolvedRole;
}

export interface CatalogModel {
  id: string;
  name: string;
}

export interface CatalogProvider {
  provider: string;
  models: CatalogModel[];
}
