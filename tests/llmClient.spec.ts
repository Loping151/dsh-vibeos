import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { runLlm } from '../src/host/ai/llmClient'

describe('DSH message source compatibility', () => {
  it('streams a frozen prompt with a producer-owned source', async () => {
    let request: GenerateOptions | undefined
    const ctx = { llm: {
      async *stream(options: GenerateOptions) {
        request = options
        yield { type: 'text-delta', text: '<main>Ready</main>' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    } } as unknown as Context
    const result = await runLlm(ctx, {
      system: 'Render a window', prompt: 'Welcome', provider: 'fixture', model: 'fixture',
      abort: new AbortController(),
    })
    expect(result).toMatchObject({ ok: true, text: '<main>Ready</main>' })
    expect(request?.messages[0]).toMatchObject({
      role: 'user', source: { kind: 'dsh-vibeos' }, content: [{ type: 'text', text: 'Welcome' }],
    })
    expect(Object.isFrozen(request?.messages[0])).toBe(true)
  })
})
