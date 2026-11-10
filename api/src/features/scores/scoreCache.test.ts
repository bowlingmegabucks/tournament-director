import { describe, expect, it, vi } from 'vitest'
import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import { cacheKey } from '../../shared/ttlCache.ts'
import { createScoreCache, dropCacheOnPublish } from './scoreCache.ts'

const tournament = '11111111-1111-4111-8111-111111111111'
const session = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
const other = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB'

describe('createScoreCache (D-232)', () => {
  it('drops the page of one session by its id alone, in any letter case', async () => {
    const cache = createScoreCache()
    const load = vi.fn(() => Promise.resolve(load.mock.calls.length))
    await cache.cached(cacheKey(tournament, session), load)
    await cache.cached(cacheKey(tournament, other), load)

    cache.dropSession(session)

    expect(await cache.cached(cacheKey(tournament, session), load)).toBe(3)
    expect(await cache.cached(cacheKey(tournament, other), load)).toBe(2)
  })
})

describe('dropCacheOnPublish', () => {
  it('drops the cached page before it tells the screens, for every kind of change', async () => {
    const cache = createScoreCache()
    const order: string[] = []
    const events = {
      publish: vi.fn(() => order.push('publish')),
      subscribe: vi.fn(),
      closeAll: vi.fn(),
      count: vi.fn(),
    } as unknown as SessionEvents
    const dropped = vi.spyOn(cache, 'dropSession').mockImplementation(() => order.push('drop'))

    dropCacheOnPublish(events, cache).publish(session, 'lanes')

    expect(dropped).toHaveBeenCalledWith(session)
    expect(events.publish).toHaveBeenCalledWith(session, 'lanes')
    expect(order).toEqual(['drop', 'publish'])
  })
})
