import { describe, expect, it } from 'vitest'
import { HttpError } from '../../shared/errors.ts'
import {
  createDivision,
  createLaneEntry,
  createSquad,
  createSweeper,
  createTournament,
} from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryDnfStore } from '../dnf/store.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import type { LaneEntry } from '../lanes/types.ts'
import { createInMemoryScoreRepository } from '../scores/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import type { Squad } from '../squads/types.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import type { Sweeper } from '../sweepers/types.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { loadLiveResults } from './loadLiveResults.ts'
import type { ResultsDeps } from './loadResults.ts'
import { liveResultsSchema } from './types.ts'

const open = createDivision({ number: 1, name: 'Open' })

interface Seat {
  sessionId: string
  entry: LaneEntry
  games: number[]
}

function setup(options: {
  squads?: Squad[]
  sweepers?: Sweeper[]
  seats?: Seat[]
  flags?: { sessionId: string; registrationId: string }[]
  superSweeperCashRatio?: number
}) {
  const tournament = createTournament({ name: 'Spring Classic' })
  const seats = options.seats ?? []
  const captured = createCapturedLogger('debug')
  const deps: ResultsDeps = {
    tournaments: createInMemoryTournamentRepository(
      [tournament],
      options.superSweeperCashRatio === undefined
        ? undefined
        : {
            [tournament.id]: {
              finalsRatio: 8,
              superSweeperCashRatio: options.superSweeperCashRatio,
            },
          },
    ),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division: open }]),
    squads: createInMemorySquadRepository(
      (options.squads ?? []).map((squad) => ({ tournamentId: tournament.id, squad })),
    ),
    sweepers: createInMemorySweeperRepository(
      (options.sweepers ?? []).map((sweeper) => ({ tournamentId: tournament.id, sweeper })),
    ),
    lanes: createInMemoryLaneRepository(
      seats.map(({ sessionId, entry }) => ({ sessionId, entry })),
    ),
    scores: createInMemoryScoreRepository(
      seats.flatMap(({ sessionId, entry, games }) =>
        games.map((score, index) => ({
          sessionId,
          score: { bowlerId: entry.bowlerId, game: index + 1, score },
        })),
      ),
    ),
    dnf: createInMemoryDnfStore(options.flags).store,
  }
  return {
    deps,
    tournament,
    reporting: { logger: captured.logger, reported: new Set<string>() },
    captured,
  }
}

const squadAt = (date: string, over: Partial<Squad> = {}) =>
  createSquad({ date, finalsRatio: 4, cashRatio: 2, games: 3, ...over })
const bowler = (over: Partial<LaneEntry> = {}) =>
  createLaneEntry({ divisionId: open.id, average: null, ...over })

describe('loadLiveResults (RES-47, D-242, D-244)', () => {
  it('lists the squads in date order, then the sweepers, and matches the schema', async () => {
    const late = squadAt('2026-10-24T13:00:00')
    const early = squadAt('2026-10-24T09:00:00')
    const sweeper = createSweeper({ cashRatio: 2, games: 2, date: '2026-10-24T18:00:00' })
    const a = bowler()
    const { deps, tournament, reporting } = setup({
      squads: [late, early],
      sweepers: [sweeper],
      seats: [
        { sessionId: early.id, entry: a, games: [200, 200, 200] },
        { sessionId: late.id, entry: bowler(), games: [190, 190, 190] },
        { sessionId: sweeper.id, entry: a, games: [210, 210] },
      ],
    })

    const result = await loadLiveResults(deps, reporting, tournament.id)

    expect(liveResultsSchema.safeParse(result).success).toBe(true)
    expect(result.tournament).toEqual({ id: tournament.id, name: 'Spring Classic' })
    expect(result.sessions.map((session) => [session.kind, session.results.session.id])).toEqual([
      ['squad', early.id],
      ['squad', late.id],
      ['sweeper', sweeper.id],
    ])
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false)
  })

  it('leaves out a session with no scores (RES-47)', async () => {
    const scored = squadAt('2026-10-24T09:00:00')
    const empty = squadAt('2026-10-24T13:00:00')
    const emptySweeper = createSweeper()
    const { deps, tournament, reporting } = setup({
      squads: [scored, empty],
      sweepers: [emptySweeper],
      seats: [{ sessionId: scored.id, entry: bowler(), games: [200] }],
    })

    const result = await loadLiveResults(deps, reporting, tournament.id)

    expect(result.sessions.map((session) => session.results.session.id)).toEqual([scored.id])
    expect(result.superSweeper).toBeNull()
  })

  it('ranks every session through the last full game (RES-40, D-239)', async () => {
    const squad = squadAt('2026-10-24T09:00:00', { complete: false })
    const { deps, tournament, reporting } = setup({
      squads: [squad],
      seats: [
        { sessionId: squad.id, entry: bowler(), games: [200, 200, 200] },
        { sessionId: squad.id, entry: bowler(), games: [190, 190] },
      ],
    })

    const [session] = (await loadLiveResults(deps, reporting, tournament.id)).sessions

    expect(session?.kind === 'squad' && session.results.mode).toBe('full-game')
    expect(session?.kind === 'squad' && session.results.divisions[0]?.throughGame).toBe(2)
  })

  it('passes advancers on from an earlier squad in the one pass (RES-06)', async () => {
    const first = squadAt('2026-10-24T09:00:00', { complete: true, finalsRatio: 2 })
    const second = squadAt('2026-10-24T13:00:00', { complete: true, finalsRatio: 2 })
    const star = bowler()
    const { deps, tournament, reporting } = setup({
      squads: [first, second],
      seats: [
        { sessionId: first.id, entry: star, games: [250, 250, 250] },
        { sessionId: first.id, entry: bowler(), games: [100, 100, 100] },
        { sessionId: second.id, entry: star, games: [260, 260, 260] },
        { sessionId: second.id, entry: bowler(), games: [150, 150, 150] },
      ],
    })

    const result = await loadLiveResults(deps, reporting, tournament.id)

    const inSecond = result.sessions[1]
    const rows = inSecond?.kind === 'squad' ? (inSecond.results.divisions[0]?.rows ?? []) : []
    // The next bowler takes the advancing spot; the earlier advancer cashes above the cut (D-81).
    expect(rows.find((row) => row.registrationId === star.registrationId)).toMatchObject({
      group: 'casher',
      advancedEarlier: true,
    })
    expect(rows[0]?.group).toBe('advancer')
  })

  it('does not wait for a flagged bowler, and tags them (RES-55, RES-56)', async () => {
    const squad = squadAt('2026-10-24T09:00:00', { complete: false })
    const walked = bowler()
    const { deps, tournament, reporting } = setup({
      squads: [squad],
      seats: [
        { sessionId: squad.id, entry: walked, games: [200] },
        { sessionId: squad.id, entry: bowler(), games: [200, 200, 200] },
      ],
      flags: [{ sessionId: squad.id, registrationId: walked.registrationId }],
    })

    const [session] = (await loadLiveResults(deps, reporting, tournament.id)).sessions

    const division = session?.kind === 'squad' ? session.results.divisions[0] : undefined
    expect(division?.throughGame).toBe(3)
    expect(division?.rows.filter((row) => row.dnf).map((row) => row.registrationId)).toEqual([
      walked.registrationId,
    ])
  })

  it('adds the super sweeper when someone has a sweeper score in it (RES-26)', async () => {
    const sweeper = createSweeper({ cashRatio: 2, games: 2 })
    const { deps, tournament, reporting } = setup({
      sweepers: [sweeper],
      seats: [
        { sessionId: sweeper.id, entry: bowler({ superSweeper: true }), games: [200, 200] },
        { sessionId: sweeper.id, entry: bowler({ superSweeper: false }), games: [190, 190] },
      ],
    })

    const result = await loadLiveResults(deps, reporting, tournament.id)

    expect(result.superSweeper?.rows).toHaveLength(1)
    expect(result.superSweeper?.mode).toBe('full-game')
  })

  it('leaves out a super sweeper whose cash ratio cannot work, and logs it (D-93)', async () => {
    const squad = squadAt('2026-10-24T09:00:00')
    const sweeper = createSweeper({ cashRatio: 2, games: 2 })
    const { deps, tournament, reporting, captured } = setup({
      squads: [squad],
      sweepers: [sweeper],
      superSweeperCashRatio: 0,
      seats: [
        { sessionId: squad.id, entry: bowler(), games: [200] },
        { sessionId: sweeper.id, entry: bowler({ superSweeper: true }), games: [200, 200] },
      ],
    })

    const result = await loadLiveResults(deps, reporting, tournament.id)

    expect(result.superSweeper).toBeNull()
    expect(result.sessions).toHaveLength(2)
    const line = captured
      .records()
      .find((entry) => /left out of the live results/.test(String(entry.msg)))
    expect(line).toMatchObject({ tournamentId: tournament.id })
  })

  it('does not hide another failure of the super sweeper (D-93)', async () => {
    const sweeper = createSweeper({ cashRatio: 2, games: 2 })
    const world = setup({
      sweepers: [sweeper],
      seats: [{ sessionId: sweeper.id, entry: bowler({ superSweeper: true }), games: [200, 200] }],
    })
    const failing = {
      ...world.deps,
      tournaments: {
        ...world.deps.tournaments,
        getRatios: () => Promise.reject(new HttpError(503, 'The database is down')),
      },
    }

    await expect(
      loadLiveResults(failing, world.reporting, world.tournament.id),
    ).rejects.toMatchObject({
      status: 503,
    })
  })

  it('names the squad in the 422 message (D-83)', async () => {
    const world = setup({ squads: [squadAt('2026-10-24T09:00:00', { cashRatio: 0 })] })
    await expect(loadLiveResults(world.deps, world.reporting, world.tournament.id)).rejects.toThrow(
      /^A squad's cash ratio is 0/,
    )
  })

  it('logs an entry whose division is not the tournament\u2019s, once (D-51)', async () => {
    const squad = squadAt('2026-10-24T09:00:00')
    const lost = bowler({ divisionId: createDivision().id })
    const world = setup({
      squads: [squad],
      seats: [{ sessionId: squad.id, entry: lost, games: [200] }],
    })

    await loadLiveResults(world.deps, world.reporting, world.tournament.id)

    expect(
      world.captured.records().some((line) => line.registrationId === lost.registrationId),
    ).toBe(true)
  })

  it('answers 404 for an unknown tournament', async () => {
    const { deps, reporting } = setup({})
    await expect(loadLiveResults(deps, reporting, createTournament().id)).rejects.toMatchObject({
      status: 404,
      message: 'Tournament not found',
    })
  })

  it('answers 422 for a squad or a sweeper whose ratio cannot work (D-83)', async () => {
    const bad = setup({ squads: [squadAt('2026-10-24T09:00:00', { cashRatio: 0 })] })
    await expect(
      loadLiveResults(bad.deps, bad.reporting, bad.tournament.id),
    ).rejects.toBeInstanceOf(HttpError)
    const sweeper = createSweeper({ cashRatio: 0 })
    const badSweeper = setup({
      sweepers: [sweeper],
      seats: [{ sessionId: sweeper.id, entry: bowler(), games: [200] }],
    })
    await expect(
      loadLiveResults(badSweeper.deps, badSweeper.reporting, badSweeper.tournament.id),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('sends no personal data (BWL-17)', async () => {
    const squad = squadAt('2026-10-24T09:00:00')
    const { deps, tournament, reporting } = setup({
      squads: [squad],
      seats: [{ sessionId: squad.id, entry: bowler(), games: [200] }],
    })

    const text = JSON.stringify(await loadLiveResults(deps, reporting, tournament.id))

    for (const word of ['ssn', 'birth', 'email', 'phone', 'address', 'average', 'gender']) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })
})
