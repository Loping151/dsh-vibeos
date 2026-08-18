/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/backend/src/ai/ModelPolicy.ts.
 * Adapted for DeepSeek Harness (dsh-vibeos): provider discovery + tier heuristics replaced by the
 * settings -> config -> ctx.agentDefaultModel resolution chain. Original license: MIT. */

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent-default-model';
import type {
  CatalogProvider,
  EffectiveModels,
  ModelRole,
  ResolvedRole,
  Settings,
} from '../../shared';
import type { Config } from '../config';

export class ModelPolicy {
  /** Flash-preferred default, primed once at boot; null until priming lands. */
  private primedDefault: { provider: string; model: string } | null = null;

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly getSettings: () => Settings,
  ) {}

  /**
   * When neither settings nor config pin a model, prefer a "flash" model from
   * the agent-default provider's catalog over the (typically heavier) current
   * selection. resolve() stays sync: it reads this cache, falling back to
   * currentSelection() until priming completes.
   */
  async primeDefaults(): Promise<void> {
    const selection = this.ctx.agentDefaultModel.currentSelection();
    let model = selection.model;
    try {
      const models = await this.ctx.llm.listModels(selection.provider);
      const flash = models.find((m) => m.id.toLowerCase().includes('flash'));
      if (flash) model = flash.id;
    } catch {
      // catalog unavailable → keep the current selection
    }
    this.primedDefault = { provider: selection.provider, model };
  }

  resolve(role: ModelRole): ResolvedRole {
    const roleConfig = role === 'ui' ? this.config.ui : this.config.fast;
    const reasoningEffort = roleConfig.reasoningEffort;

    const override = this.getSettings().modelOverrides[role];
    if (override?.provider && override.model) {
      return { provider: override.provider, model: override.model, reasoningEffort, source: 'settings' };
    }

    const configured = roleConfig.model;
    if (configured?.provider && configured.model) {
      return { provider: configured.provider, model: configured.model, reasoningEffort, source: 'config' };
    }

    if (role === 'fast') {
      return { ...this.resolve('ui'), reasoningEffort };
    }

    const fallback = this.primedDefault ?? this.ctx.agentDefaultModel.currentSelection();
    return { provider: fallback.provider, model: fallback.model, reasoningEffort, source: 'default' };
  }

  effectiveModels(): EffectiveModels {
    return { ui: this.resolve('ui'), fast: this.resolve('fast') };
  }

  /** Advisory catalog for the Settings ModelsPane; a provider that fails to list yields []. */
  async listCatalog(): Promise<CatalogProvider[]> {
    const out: CatalogProvider[] = [];
    for (const provider of this.ctx.llm.listProviders()) {
      try {
        const models = await this.ctx.llm.listModels(provider.id);
        out.push({ provider: provider.id, models: models.map((m) => ({ id: m.id, name: m.name })) });
      } catch {
        out.push({ provider: provider.id, models: [] });
      }
    }
    return out;
  }
}
