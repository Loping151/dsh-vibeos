import { describe, expect, it } from 'vitest'
import { MemoryRepo } from '../src/host/state/repos/MemoryRepo'
import type { MemoryHandle } from '../src/host/state/domains'

function fakeTable() {
  const map = new Map<string, unknown>()
  return {
    get: (k: string) => map.get(k),
    put: async (k: string, v: unknown) => {
      map.set(k, v)
    },
    delete: async (k: string) => map.delete(k),
    entries: () => map.entries(),
    keys: () => map.keys(),
    get size() {
      return map.size
    },
    update: async (k: string, fn: (v: unknown) => unknown) => {
      const next = fn(map.get(k))
      map.set(k, next)
      return next
    },
  }
}

function fakeHandle(): MemoryHandle {
  const tables: Record<string, ReturnType<typeof fakeTable>> = {
    memory: fakeTable(),
    interactions: fakeTable(),
  }
  return {
    domain: { table: (name: string) => tables[name] },
    enqueue: <T>(fn: () => T | Promise<T>) => Promise.resolve().then(fn),
  } as unknown as MemoryHandle
}

describe('MemoryRepo snapshot history', () => {
  it('shifts current into prevSnapshot on save', async () => {
    const repo = new MemoryRepo(fakeHandle())
    await repo.ensureMemory('w1', 'app')
    await repo.saveSnapshot('w1', '<a>A</a>')
    expect(repo.getMemory('w1')?.prevSnapshot).toBeUndefined()
    await repo.saveSnapshot('w1', '<b>B</b>')
    const m = repo.getMemory('w1')
    expect(m?.htmlSnapshot).toBe('<b>B</b>')
    expect(m?.prevSnapshot).toBe('<a>A</a>')
  })

  it('swap round-trips (self-inverse undo/redo)', async () => {
    const repo = new MemoryRepo(fakeHandle())
    await repo.ensureMemory('w1', 'app')
    await repo.saveSnapshot('w1', '<a>A</a>')
    await repo.saveSnapshot('w1', '<b>B</b>')
    expect(await repo.swapSnapshot('w1')).toBe('<a>A</a>')
    let m = repo.getMemory('w1')
    expect(m?.htmlSnapshot).toBe('<a>A</a>')
    expect(m?.prevSnapshot).toBe('<b>B</b>')
    expect(await repo.swapSnapshot('w1')).toBe('<b>B</b>')
    m = repo.getMemory('w1')
    expect(m?.htmlSnapshot).toBe('<b>B</b>')
    expect(m?.prevSnapshot).toBe('<a>A</a>')
  })

  it('returns undefined and leaves state untouched without a prev', async () => {
    const repo = new MemoryRepo(fakeHandle())
    expect(await repo.swapSnapshot('missing')).toBeUndefined()
    await repo.ensureMemory('w1', 'app')
    await repo.saveSnapshot('w1', '<a>A</a>')
    expect(await repo.swapSnapshot('w1')).toBeUndefined()
    expect(repo.getMemory('w1')?.htmlSnapshot).toBe('<a>A</a>')
  })
})
