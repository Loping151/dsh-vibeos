import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { ModelPolicy } from '../src/host/ai/modelPolicy'
import type { Config } from '../src/host/config'
import { DEFAULT_SETTINGS, type Settings } from '../src/shared'

function fakeCtx(models: Array<{ id: string; name: string }> | Error): Context {
  return {
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4' }),
    },
    llm: {
      listModels: async () => {
        if (models instanceof Error) throw models
        return models
      },
      listProviders: () => [],
    },
  } as unknown as Context
}

function fakeConfig(over?: { ui?: { provider: string; model: string } }): Config {
  return {
    ui: { model: over?.ui ?? {}, reasoningEffort: 'off', genTimeoutMs: 1, snapshotBudget: 0, maxTokens: 1 },
    fast: { model: {}, reasoningEffort: 'off', maxTokens: 1 },
  } as Config
}

function settings(over?: Partial<Settings>): () => Settings {
  return () => ({ ...DEFAULT_SETTINGS, ...over })
}

const CATALOG = [
  { id: 'deepseek-v4', name: 'V4' },
  { id: 'deepseek-v4-Flash', name: 'V4 Flash' },
]

describe('ModelPolicy flash default', () => {
  it('falls back to currentSelection before priming', () => {
    const policy = new ModelPolicy(fakeCtx(CATALOG), fakeConfig(), settings())
    expect(policy.resolve('ui')).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4',
      source: 'default',
    })
  })

  it('prefers a flash model after priming, for both roles, source stays default', async () => {
    const policy = new ModelPolicy(fakeCtx(CATALOG), fakeConfig(), settings())
    await policy.primeDefaults()
    expect(policy.resolve('ui')).toMatchObject({ model: 'deepseek-v4-Flash', source: 'default' })
    expect(policy.resolve('fast')).toMatchObject({ model: 'deepseek-v4-Flash', source: 'default' })
  })

  it('keeps currentSelection when the catalog has no flash model or fails to list', async () => {
    const noFlash = new ModelPolicy(fakeCtx([{ id: 'deepseek-v4', name: 'V4' }]), fakeConfig(), settings())
    await noFlash.primeDefaults()
    expect(noFlash.resolve('ui').model).toBe('deepseek-v4')

    const failing = new ModelPolicy(fakeCtx(new Error('offline')), fakeConfig(), settings())
    await failing.primeDefaults()
    expect(failing.resolve('ui').model).toBe('deepseek-v4')
  })

  it('settings and config overrides still win over the primed default', async () => {
    const withSettings = new ModelPolicy(
      fakeCtx(CATALOG),
      fakeConfig(),
      settings({ modelOverrides: { ui: { provider: 'p', model: 'm' } } }),
    )
    await withSettings.primeDefaults()
    expect(withSettings.resolve('ui')).toMatchObject({ provider: 'p', model: 'm', source: 'settings' })

    const withConfig = new ModelPolicy(
      fakeCtx(CATALOG),
      fakeConfig({ ui: { provider: 'c', model: 'cm' } }),
      settings(),
    )
    await withConfig.primeDefaults()
    expect(withConfig.resolve('ui')).toMatchObject({ provider: 'c', model: 'cm', source: 'config' })
  })
})
