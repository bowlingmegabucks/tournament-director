import { describe, expect, it, vi } from 'vitest'
import { cacheKey, createTtlCache, MAX_CACHED } from './ttlCache.ts'

describe('createTtlCache', () => {
  it('shares one call inside the window and calls again after it', async () => {
    let time = 0
    const cached = createTtlCache<number>(1000, () => time)
    const load = vi.fn(() => Promise.resolve(load.mock.calls.length))

    expect(await cached('a', load)).toBe(1)
    time = 999
    expect(await cached('a', load)).toBe(1)
    time = 1000
    expect(await cached('a', load)).toBe(2)
  })

  it('keeps keys apart', async () => {
    const cached = createTtlCache<string>(1000, () => 0)
    expect(await cached('a', () => Promise.resolve('A'))).toBe('A')
    expect(await cached('b', () => Promise.resolve('B'))).toBe('B')
  })

  it('does not keep a failure', async () => {
    const cached = createTtlCache<string>(1000, () => 0)
    await expect(cached('a', () => Promise.reject(new Error('down')))).rejects.toThrow('down')
    expect(await cached('a', () => Promise.resolve('ok'))).toBe('ok')
  })

  it('starts over at the cap', async () => {
    const cached = createTtlCache<number>(1000, () => 0)
    const load = vi.fn(() => Promise.resolve(1))
    for (let index = 0; index < MAX_CACHED; index++) await cached(`k${index}`, load)
    await cached('first-after-cap', load)
    await cached('k0', load)
    expect(load).toHaveBeenCalledTimes(MAX_CACHED + 2)
  })
})

describe('cacheKey', () => {
  it('joins the ids and ignores their case', () => {
    expect(cacheKey('AB-1', 'Cd-2')).toBe('ab-1/cd-2')
    expect(cacheKey('AB-1')).toBe('ab-1')
  })
})
