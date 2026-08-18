import type { Context } from '@deepseek-ai/cordis';
import type { CatalogProvider, EffectiveModels, ModelRole, ResolvedRole, Settings } from '../../shared';
import type { Config } from '../config';
export declare class ModelPolicy {
    private readonly ctx;
    private readonly config;
    private readonly getSettings;
    /** Flash-preferred default, primed once at boot; null until priming lands. */
    private primedDefault;
    constructor(ctx: Context, config: Config, getSettings: () => Settings);
    /**
     * When neither settings nor config pin a model, prefer a "flash" model from
     * the agent-default provider's catalog over the (typically heavier) current
     * selection. resolve() stays sync: it reads this cache, falling back to
     * currentSelection() until priming completes.
     */
    primeDefaults(): Promise<void>;
    resolve(role: ModelRole): ResolvedRole;
    effectiveModels(): EffectiveModels;
    /** Advisory catalog for the Settings ModelsPane; a provider that fails to list yields []. */
    listCatalog(): Promise<CatalogProvider[]>;
}
