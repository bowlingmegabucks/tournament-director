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

describe('dropTournament (D-244)', () => {
  it('drops the TV feed of one tournament and nothing else', async () => {
    const cache = createScoreCache()
    const load = vi.fn(() => Promise.resolve(load.mock.calls.length))
    await cache.cached(cacheKey('live-results', tournament), load)
    await cache.cached(cacheKey('live-results', other), load)
    await cache.cached(cacheKey(tournament, session), load)

    cache.dropTournament(tournament)

    expect(await cache.cached(cacheKey('live-results', tournament), load)).toBe(4)
    expect(await cache.cached(cacheKey('live-results', other), load)).toBe(2)
    expect(await cache.cached(cacheKey(tournament, session), load)).toBe(3)
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
      watching: vi.fn(),
    } as unknown as SessionEvents
    const dropped = vi.spyOn(cache, 'dropSession').mockImplementation(() => order.push('drop'))

    dropCacheOnPublish(events, cache).publish(session, 'lanes')

    expect(dropped).toHaveBeenCalledWith(session)
    expect(events.publish).toHaveBeenCalledWith(session, 'lanes', undefined)
    expect(order).toEqual(['drop', 'publish'])
  })

  it('passes the detail of a message on (D-243)', () => {
    const cache = createScoreCache()
    const events = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      closeAll: vi.fn(),
      count: vi.fn(),
      watching: vi.fn(),
    } as unknown as SessionEvents
    const detail = { sessionId: session, sessionKind: 'squad' as const, game: 2 }

    dropCacheOnPublish(events, cache).publish('live:t1', 'game-full', detail)

    expect(events.publish).toHaveBeenCalledWith('live:t1', 'game-full', detail)
  })
})
