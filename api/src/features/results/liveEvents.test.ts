import { metrics } from '@opentelemetry/api'
import { describe, expect, it, vi } from 'vitest'
import {
  createSessionEvents,
  type ChangeEvent,
  type SessionEvents,
} from '../../shared/events/sessionEvents.ts'
import { liveKey } from '../../shared/events/sseRoute.ts'
import { createDivision, createLaneEntry, createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryDnfStore } from '../dnf/store.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import type { LaneEntry } from '../lanes/types.ts'
import { createInMemoryScoreRepository, type ScoreRepository } from '../scores/repository.ts'
import { createScoreCache } from '../scores/scoreCache.ts'
import { createLiveNotifier } from './liveEvents.ts'

const open = createDivision({ number: 1, name: 'Open' })
const senior = createDivision({ number: 2, name: 'Senior' })
const tournamentId = createTournament().id
const sessionId = '77777777-7777-4777-8777-777777777777'

type Scores = Record<string, number[]>

function setup(initial: Scores = {}, entries: LaneEntry[] = []) {
  const captured = createCapturedLogger()
  const hub = createSessionEvents(captured.logger, metrics.getMeter('test'))
  const seen: ChangeEvent[] = []
  const watching = hub.subscribe(liveKey(tournamentId), {
    send: (event) => seen.push(event),
    end: () => undefined,
  })
  const dnf = createInMemoryDnfStore()
  const cache = createScoreCache()
  const state: Scores = { ...initial }
  const scores: ScoreRepository = {
    listScores: (id) =>
      createInMemoryScoreRepository(
        entries.flatMap((entry) =>
          (state[entry.bowlerId] ?? []).map((score, index) => ({
            sessionId: id,
            score: { bowlerId: entry.bowlerId, game: index + 1, score },
          })),
        ),
      ).listScores(id),
  }
  const dropped = vi.spyOn(cache, 'dropTournament')
  const notifier = (events: SessionEvents = hub) =>
    createLiveNotifier({
      events,
      cache,
      lanes: createInMemoryLaneRepository(entries.map((entry) => ({ sessionId, entry }))),
      scores,
      divisions: createInMemoryDivisionRepository([
        { tournamentId, division: open },
        { tournamentId, division: senior },
      ]),
      dnf: dnf.store,
      logger: captured.logger,
    })
  return { notifier, hub, seen, state, dnf, dropped, captured, watching }
}

const bowler = (divisionId = open.id) => createLaneEntry({ divisionId, average: null })

describe('live notifier (RES-49, D-243)', () => {
  it('sends game-full with the division and the new game when a game fills', async () => {
    const a = bowler()
    const b = bowler()
    const { notifier, seen, state, dropped } = setup(
      { [a.bowlerId]: [200, 200], [b.bowlerId]: [200] },
      [a, b],
    )
    const live = notifier()

    const before = await live.before(tournamentId, 'squad', sessionId)
    state[b.bowlerId] = [200, 200]
    await live.after(before)

    expect(seen).toEqual([
      {
        kind: 'game-full',
        detail: { sessionId, sessionKind: 'squad', divisionId: open.id, game: 2 },
        version: 1,
      },
    ])
    expect(dropped).toHaveBeenCalledWith(tournamentId)
  })

  it('sends nothing when the count does not move, and drops nothing', async () => {
    const a = bowler()
    const b = bowler()
    const { notifier, seen, state, dropped } = setup(
      { [a.bowlerId]: [200, 200], [b.bowlerId]: [200] },
      [a, b],
    )
    const live = notifier()

    const before = await live.before(tournamentId, 'squad', sessionId)
    state[a.bowlerId] = [200, 200, 200]
    await live.after(before)

    expect(seen).toEqual([])
    expect(dropped).not.toHaveBeenCalled()
  })

  it('sends one message for each division that moved, and none for the other (RES-40)', async () => {
    const a = bowler(open.id)
    const s = bowler(senior.id)
    const t = bowler(senior.id)
    const { notifier, seen, state } = setup(
      { [a.bowlerId]: [200], [s.bowlerId]: [200], [t.bowlerId]: [200] },
      [a, s, t],
    )
    const live = notifier()

    const before = await live.before(tournamentId, 'squad', sessionId)
    state[s.bowlerId] = [200, 200]
    state[t.bowlerId] = [200, 200]
    await live.after(before)

    expect(seen.map((event) => event.detail)).toEqual([
      { sessionId, sessionKind: 'squad', divisionId: senior.id, game: 2 },
    ])
  })

  it('sends reopened, with no game, when a clear lowers the count', async () => {
    const a = bowler()
    const { notifier, seen, state } = setup({ [a.bowlerId]: [200, 200] }, [a])
    const live = notifier()

    const before = await live.before(tournamentId, 'squad', sessionId)
    state[a.bowlerId] = [200]
    await live.after(before)

    expect(seen).toEqual([
      {
        kind: 'reopened',
        detail: { sessionId, sessionKind: 'squad', divisionId: open.id },
        version: 1,
      },
    ])
  })

  it('names no division for a sweeper (D-243)', async () => {
    const a = bowler()
    const b = bowler(senior.id)
    const { notifier, seen, state } = setup({ [a.bowlerId]: [200], [b.bowlerId]: [200] }, [a, b])
    const live = notifier()

    const before = await live.before(tournamentId, 'sweeper', sessionId)
    state[a.bowlerId] = [200, 200]
    state[b.bowlerId] = [200, 200]
    await live.after(before)

    expect(seen.map((event) => event.detail)).toEqual([
      { sessionId, sessionKind: 'sweeper', game: 2 },
    ])
  })

  it('counts a flag as a change when it frees a game (RES-55, D-251)', async () => {
    const walked = bowler()
    const b = bowler()
    const { notifier, seen, dnf } = setup(
      { [walked.bowlerId]: [200], [b.bowlerId]: [200, 200, 200] },
      [walked, b],
    )
    const live = notifier()

    const before = await live.before(tournamentId, 'squad', sessionId)
    await dnf.store.set(sessionId, walked.registrationId)
    await live.after(before)

    expect(seen.map((event) => [event.kind, event.detail?.game])).toEqual([['game-full', 3]])
  })

  it('takes no snapshot when nobody watches the tournament', async () => {
    const a = bowler()
    const { hub, watching } = setup({ [a.bowlerId]: [200] }, [a])
    watching?.()
    const lanesRead = vi.fn()
    const live = createLiveNotifier({
      events: hub,
      cache: createScoreCache(),
      lanes: { ...createInMemoryLaneRepository([]), listEntries: lanesRead },
      scores: { listScores: lanesRead },
      divisions: createInMemoryDivisionRepository([]),
      dnf: createInMemoryDnfStore().store,
      logger: createCapturedLogger().logger,
    })

    expect(await live.before(tournamentId, 'squad', sessionId)).toBeUndefined()
    await live.after(undefined)

    expect(lanesRead).not.toHaveBeenCalled()
  })

  it('does not fail the save when a read fails, and logs it (RES-49)', async () => {
    const { hub, captured } = setup()
    const failing = createLiveNotifier({
      events: hub,
      cache: createScoreCache(),
      lanes: createInMemoryLaneRepository([]),
      scores: { listScores: () => Promise.reject(new Error('database down')) },
      divisions: createInMemoryDivisionRepository([]),
      dnf: createInMemoryDnfStore().store,
      logger: captured.logger,
    })

    expect(await failing.before(tournamentId, 'squad', sessionId)).toBeUndefined()
    await failing.after({ tournamentId, kind: 'squad', sessionId, counted: new Map() })

    const lines = captured.records().filter((entry) => entry.level === 40)
    expect(lines.map((line) => line.msg)).toEqual([
      'Could not read the counted games',
      'Could not tell the live results of a change',
    ])
    // Ids and the cause, so the line can be found; never a name or a score.
    for (const line of lines) expect(line).toMatchObject({ tournamentId, sessionId })
    expect(lines[0]?.err).toBeDefined()
  })

  it('says a session completed and drops the feed (RES-49)', () => {
    const { notifier, seen, dropped } = setup()

    notifier().completed(tournamentId, 'sweeper', sessionId)

    expect(seen).toEqual([
      { kind: 'complete', detail: { sessionId, sessionKind: 'sweeper' }, version: 1 },
    ])
    expect(dropped).toHaveBeenCalledWith(tournamentId)
  })

  it('publishes a rise once when two saves fill the same game together', async () => {
    const a = bowler()
    const b = bowler()
    const { notifier, seen, state } = setup({ [a.bowlerId]: [200], [b.bowlerId]: [200] }, [a, b])
    const live = notifier()

    // Both keepers took their snapshot before either write landed.
    const first = await live.before(tournamentId, 'squad', sessionId)
    const second = await live.before(tournamentId, 'squad', sessionId)
    state[a.bowlerId] = [200, 200]
    state[b.bowlerId] = [200, 200]
    await Promise.all([live.after(first), live.after(second)])

    expect(seen.filter((event) => event.kind === 'game-full')).toHaveLength(1)
  })

  it('still publishes a rise that a late snapshot already contains', async () => {
    const a = bowler()
    const b = bowler()
    const { notifier, seen, state } = setup({ [a.bowlerId]: [200], [b.bowlerId]: [200] }, [a, b])
    const live = notifier()

    const early = await live.before(tournamentId, 'squad', sessionId)
    state[a.bowlerId] = [200, 200]
    state[b.bowlerId] = [200, 200]
    // A snapshot taken after the other save: it already reads game 2, so it alone sees no change.
    const late = await live.before(tournamentId, 'squad', sessionId)
    await live.after(late)
    await live.after(early)

    expect(seen.filter((event) => event.kind === 'game-full')).toHaveLength(1)
  })

  it('forgets what it saw once nobody watches, so a return does not replay old changes', async () => {
    const a = bowler()
    const { notifier, seen, state, watching, hub } = setup({ [a.bowlerId]: [200] }, [a])
    const live = notifier()
    const first = await live.before(tournamentId, 'squad', sessionId)
    state[a.bowlerId] = [200, 200]
    await live.after(first)

    watching?.()
    expect(await live.before(tournamentId, 'squad', sessionId)).toBeUndefined()
    state[a.bowlerId] = [200, 200, 200]
    hub.subscribe(liveKey(tournamentId), {
      send: (event) => seen.push(event),
      end: () => undefined,
    })
    seen.length = 0
    const again = await live.before(tournamentId, 'squad', sessionId)
    state[a.bowlerId] = [200, 200, 200, 200]
    await live.after(again)

    expect(seen.map((event) => [event.kind, event.detail?.game])).toEqual([['game-full', 4]])
  })
})
