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

  it('forgets one key on drop and keeps the others (D-232)', async () => {
    const cached = createTtlCache<number>(1000, () => 0)
    const load = vi.fn(() => Promise.resolve(load.mock.calls.length))
    await cached('a', load)
    await cached('b', load)

    cached.drop('a')

    expect(await cached('a', load)).toBe(3)
    expect(await cached('b', load)).toBe(2)
  })

  it('forgets every key that passes the test on dropWhere and keeps the rest', async () => {
    const cached = createTtlCache<number>(1000, () => 0)
    const load = vi.fn(() => Promise.resolve(load.mock.calls.length))
    await cached('t1/s1', load)
    await cached('t2/s1', load)
    await cached('t1/s2', load)

    cached.dropWhere((key) => key.endsWith('/s1'))

    expect(await cached('t1/s1', load)).toBe(4)
    expect(await cached('t2/s1', load)).toBe(5)
    expect(await cached('t1/s2', load)).toBe(3)
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

  it('keeps every answer while it is under the cap', async () => {
    const cached = createTtlCache<number>(1000, () => 0)
    const load = vi.fn(() => Promise.resolve(1))
    await cached('a', load)
    await cached('b', load)
    await cached('a', load)
    await cached('b', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not forget a newer answer when an older call for the key fails late', async () => {
    let time = 0
    const cached = createTtlCache<number>(1000, () => time)
    let failOld: (error: Error) => void = () => undefined
    const old = cached('a', () => new Promise<number>((_, reject) => (failOld = reject)))
    time = 1000
    const newer = vi.fn(() => Promise.resolve(2))
    await cached('a', newer)

    failOld(new Error('late'))
    await expect(old).rejects.toThrow('late')
    await cached('a', newer)

    expect(newer).toHaveBeenCalledTimes(1)
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
