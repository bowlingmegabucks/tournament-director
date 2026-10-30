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
import type { Division } from '../divisions/types.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import type { LaneEntry } from '../lanes/types.ts'
import { createInMemoryScoreRepository, type ScoreRepository } from '../scores/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import type { Squad } from '../squads/types.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import type { Sweeper } from '../sweepers/types.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { loadSquadResults, loadSweeperResults, type ResultsDeps } from './loadResults.ts'
import { squadResultsSchema, sweeperResultsSchema } from './types.ts'

const open = createDivision({ number: 1, name: 'Open' })
const seniors = createDivision({ number: 2, name: 'Women/Senior' })

/** Small ratios, so four bowlers give one advancer and one casher: A = 1, C = 2 - 1. */
const squadAt = (date: string, over: Partial<Squad> = {}) =>
  createSquad({ date, finalsRatio: 4, cashRatio: 2, games: 3, ...over })

const morning = '2026-10-24T09:00:00'
const noon = '2026-10-24T13:00:00'

interface Seat {
  sessionId: string
  entry: LaneEntry
  games: number[]
}

function setup(options: {
  squads?: Squad[]
  sweepers?: Sweeper[]
  seats?: Seat[]
  divisions?: Division[]
}) {
  const tournament = createTournament()
  const seats = options.seats ?? []
  const asked: string[] = []
  const stored = createInMemoryScoreRepository(
    seats.flatMap(({ sessionId, entry, games }) =>
      games.map((score, index) => ({
        sessionId,
        score: { bowlerId: entry.bowlerId, game: index + 1, score },
      })),
    ),
  )
  const scores: ScoreRepository = {
    listScores: (sessionId) => {
      asked.push(sessionId)
      return stored.listScores(sessionId)
    },
  }
  const deps: ResultsDeps = {
    tournaments: createInMemoryTournamentRepository([tournament]),
    divisions: createInMemoryDivisionRepository(
      (options.divisions ?? [open]).map((division) => ({
        tournamentId: tournament.id,
        division,
      })),
    ),
    squads: createInMemorySquadRepository(
      (options.squads ?? []).map((squad) => ({ tournamentId: tournament.id, squad })),
    ),
    sweepers: createInMemorySweeperRepository(
      (options.sweepers ?? []).map((sweeper) => ({ tournamentId: tournament.id, sweeper })),
    ),
    lanes: createInMemoryLaneRepository(
      seats.map(({ sessionId, entry }) => ({ sessionId, entry })),
    ),
    scores,
  }
  const captured = createCapturedLogger()
  const reporting = { logger: captured.logger, reported: new Set<string>() }
  return { deps, reporting, tournament, asked, captured }
}

const bowler = (divisionId = open.id) => createLaneEntry({ divisionId, average: null })

/** Four bowlers, each in every squad given, with these games. */
function field(sessions: string[], games: number[][], divisionId = open.id) {
  const bowlers = games.map(() => bowler(divisionId))
  const seats = sessions.flatMap((sessionId) =>
    bowlers.map((entry, index) => ({ sessionId, entry, games: games[index] ?? [] })),
  )
  return { bowlers, seats }
}

const four = [
  [250, 250, 250],
  [200, 200, 200],
  [190, 190, 190],
  [180, 180, 180],
]

const rowOf = (result: Awaited<ReturnType<typeof loadSquadResults>>, entry: LaneEntry) =>
  result.divisions
    .flatMap((division) => division.rows)
    .find((row) => row.registrationId === entry.registrationId)

describe('loadSquadResults: earlier squads (RES-06, SQD-19, SQD-20)', () => {
  it('reads only the squads before and including this one (FL-1)', async () => {
    const past = squadAt('2026-10-23T09:00:00')
    const current = squadAt(morning)
    const future = squadAt('2026-10-25T09:00:00')
    const { deps, reporting, tournament, asked } = setup({ squads: [future, past, current] })

    await loadSquadResults(deps, reporting, tournament.id, current.id)

    expect(asked.toSorted()).toEqual([past.id, current.id].toSorted())
  })

  it('works the squads out in date order, so an advancer of squad 1 is an earlier advancer in squad 2 (FL-2)', async () => {
    const early = squadAt(morning)
    const late = squadAt(noon)
    const { bowlers, seats } = field([early.id, late.id], four)
    const [first, second] = bowlers
    if (!first || !second) throw new Error('no bowlers')
    const { deps, reporting, tournament } = setup({ squads: [late, early], seats })

    const inEarly = await loadSquadResults(deps, reporting, tournament.id, early.id)
    const inLate = await loadSquadResults(deps, reporting, tournament.id, late.id)

    expect(rowOf(inEarly, first)).toMatchObject({
      group: 'advancer',
      place: 1,
      advancedEarlier: false,
    })
    // In the later squad the top bowler cannot advance again: the next best does, and they cash.
    expect(rowOf(inLate, second)).toMatchObject({ group: 'advancer', place: 1 })
    expect(rowOf(inLate, first)).toMatchObject({ group: 'casher', place: 2, advancedEarlier: true })
  })

  it('does not call a bowler an earlier advancer in the squad they advance in (FL-6)', async () => {
    const only = squadAt(morning)
    const { bowlers, seats } = field([only.id], four)
    const { deps, reporting, tournament } = setup({ squads: [only], seats })

    const result = await loadSquadResults(deps, reporting, tournament.id, only.id)

    expect(result.divisions[0]?.rows.every((row) => !row.advancedEarlier)).toBe(true)
    expect(bowlers).toHaveLength(4)
  })

  it('orders two squads at the same time by starting lane, then id (FL-3, SQD-20, D-45)', async () => {
    const second = squadAt(morning, { startingLane: 11 })
    const first = squadAt(morning, { startingLane: 1 })
    const { bowlers, seats } = field([first.id, second.id], four)
    const top = bowlers[0]
    if (!top) throw new Error('no bowlers')
    const { deps, reporting, tournament, asked } = setup({ squads: [second, first], seats })

    const inSecond = await loadSquadResults(deps, reporting, tournament.id, second.id)
    expect(rowOf(inSecond, top)).toMatchObject({ advancedEarlier: true })

    asked.length = 0
    await loadSquadResults(deps, reporting, tournament.id, first.id)
    expect(asked).toEqual([first.id])
  })

  it('has no earlier advancers when the earlier squad has no scores (FL-4)', async () => {
    const early = squadAt(morning)
    const late = squadAt(noon)
    const { seats } = field([late.id], four)
    const { deps, reporting, tournament } = setup({ squads: [early, late], seats })

    const result = await loadSquadResults(deps, reporting, tournament.id, late.id)

    expect(result.divisions[0]?.rows.every((row) => !row.advancedEarlier)).toBe(true)
    expect(result.divisions[0]?.rows[0]).toMatchObject({ group: 'advancer' })
  })

  it('uses the scores saved so far in an earlier squad that is still open (FL-5, RES-01)', async () => {
    const early = squadAt(morning, { complete: false })
    const late = squadAt(noon)
    const partial = four.map((games) => games.slice(0, 1))
    const early4 = field([early.id], partial)
    const lateSeats = early4.bowlers.map((entry, index) => ({
      sessionId: late.id,
      entry,
      games: four[index] ?? [],
    }))
    const top = early4.bowlers[0]
    if (!top) throw new Error('no bowlers')
    const { deps, reporting, tournament } = setup({
      squads: [early, late],
      seats: [...early4.seats, ...lateSeats],
    })

    const result = await loadSquadResults(deps, reporting, tournament.id, late.id)

    expect(rowOf(result, top)).toMatchObject({ advancedEarlier: true })
  })

  it('does not count a bowler who did not finish a complete earlier squad as an earlier advancer (FL-7, D-75)', async () => {
    const early = squadAt(morning, { complete: true })
    const late = squadAt(noon)
    const bowlers = four.map(() => bowler())
    const [quit, ...rest] = bowlers
    if (!quit) throw new Error('no bowlers')
    const earlySeats = [
      { sessionId: early.id, entry: quit, games: [300, 300] },
      ...rest.map((entry, index) => ({
        sessionId: early.id,
        entry,
        games: four[index + 1] ?? [],
      })),
    ]
    const lateSeats = bowlers.map((entry, index) => ({
      sessionId: late.id,
      entry,
      games: four[index] ?? [],
    }))
    const { deps, reporting, tournament } = setup({
      squads: [early, late],
      seats: [...earlySeats, ...lateSeats],
    })

    const result = await loadSquadResults(deps, reporting, tournament.id, late.id)

    expect(rowOf(result, quit)).toMatchObject({
      group: 'advancer',
      place: 1,
      advancedEarlier: false,
    })
  })
})

describe('loadSquadResults: the result (RES-10, RES-11b, D-77)', () => {
  it('works each division out alone and lists them by name (SQ-17)', async () => {
    const squad = squadAt(morning, { finalsRatio: 40, cashRatio: 40 })
    const inOpen = field(
      [squad.id],
      [
        [200, 200, 200],
        [190, 190, 190],
      ],
      open.id,
    )
    const inSeniors = field(
      [squad.id],
      [
        [150, 150, 150],
        [140, 140, 140],
      ],
      seniors.id,
    )
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats: [...inSeniors.seats, ...inOpen.seats],
      divisions: [seniors, open],
    })

    const result = await loadSquadResults(deps, reporting, tournament.id, squad.id)

    expect(result.divisions.map((division) => division.name)).toEqual(['Open', 'Women/Senior'])
    expect(result.divisions.map((division) => division.entries)).toEqual([2, 2])
    expect(result.divisions[0]?.rows.map((row) => row.total)).toEqual([600, 570])
    expect(result.divisions[1]?.rows.map((row) => row.total)).toEqual([450, 420])
  })

  it('uses the squad’s own ratios and sends them (SQ-18, RES-03)', async () => {
    const squad = squadAt(morning, { finalsRatio: 2, cashRatio: 2 })
    const { seats } = field([squad.id], four)
    const { deps, reporting, tournament } = setup({ squads: [squad], seats })

    const result = await loadSquadResults(deps, reporting, tournament.id, squad.id)

    expect(result.finalsRatio).toBe(2)
    expect(result.cashRatio).toBe(2)
    expect(result.divisions[0]?.rows.filter((row) => row.group === 'advancer')).toHaveLength(2)
  })

  it('leaves out a division with no entries (SQ-21, D-77)', async () => {
    const squad = squadAt(morning)
    const { seats } = field([squad.id], four)
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats,
      divisions: [open, seniors],
    })

    const result = await loadSquadResults(deps, reporting, tournament.id, squad.id)

    expect(result.divisions.map((division) => division.name)).toEqual(['Open'])
  })

  it('returns no divisions when no one has a score (D-77)', async () => {
    const squad = squadAt(morning)
    const { deps, reporting, tournament } = setup({ squads: [squad] })

    const result = await loadSquadResults(deps, reporting, tournament.id, squad.id)

    expect(result.divisions).toEqual([])
  })

  it('describes the session and matches the schema', async () => {
    const squad = squadAt(morning, { complete: true, games: 4 })
    const { seats } = field([squad.id], four)
    const { deps, reporting, tournament } = setup({ squads: [squad], seats })

    const result = await loadSquadResults(deps, reporting, tournament.id, squad.id)

    expect(result.session).toEqual({
      id: squad.id,
      kind: 'squad',
      date: morning,
      complete: true,
      games: 4,
    })
    expect(squadResultsSchema.safeParse(result).success).toBe(true)
  })

  it('adds the handicap from the division and the bowler’s average (SCR-07, SCR-08)', async () => {
    const handicapped = createDivision({
      name: 'Open',
      handicapBase: 220,
      handicapPercentage: 90,
      maximumHandicapPerGame: 50,
    })
    const squad = squadAt(morning)
    const entry = createLaneEntry({ divisionId: handicapped.id, average: 200 })
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      divisions: [handicapped],
      seats: [{ sessionId: squad.id, entry, games: [200, 200, 200] }],
    })

    const result = await loadSquadResults(deps, reporting, tournament.id, squad.id)

    expect(result.divisions[0]?.showHandicap).toBe(true)
    expect(rowOf(result, entry)).toMatchObject({ handicap: 18, total: 654, highGame: 218 })
  })

  it('skips an entry whose division is not the tournament’s, and logs it once (FL-9, D-51)', async () => {
    const squad = squadAt(morning)
    const lost = createLaneEntry({ divisionId: createDivision().id })
    const { deps, reporting, tournament, captured } = setup({
      squads: [squad],
      seats: [{ sessionId: squad.id, entry: lost, games: [200, 200, 200] }],
    })

    const first = await loadSquadResults(deps, reporting, tournament.id, squad.id)
    await loadSquadResults(deps, reporting, tournament.id, squad.id)

    expect(first.divisions).toEqual([])
    const warnings = captured.records().filter((record) => record.level === 40)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      registrationId: lost.registrationId,
      sessionId: squad.id,
      msg: 'Skipped a result entry whose division is not in this tournament',
    })
  })
})

describe('loadSquadResults: errors', () => {
  it('answers 404 for an unknown tournament', async () => {
    const { deps, reporting } = setup({})

    await expect(
      loadSquadResults(deps, reporting, createTournament().id, createSquad().id),
    ).rejects.toMatchObject({ status: 404, message: 'Tournament not found' })
  })

  it('answers 404 for an unknown squad', async () => {
    const { deps, reporting, tournament } = setup({ squads: [squadAt(morning)] })

    await expect(
      loadSquadResults(deps, reporting, tournament.id, createSquad().id),
    ).rejects.toMatchObject({ status: 404, message: 'Squad not found' })
  })

  it('answers 422 for a finals ratio of 0 (RT-3, D-83)', async () => {
    const squad = squadAt(morning, { finalsRatio: 0 })
    const { deps, reporting, tournament } = setup({ squads: [squad] })

    const failure = await loadSquadResults(deps, reporting, tournament.id, squad.id).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(HttpError)
    expect(failure).toMatchObject({
      status: 422,
      message:
        "This squad's finals ratio is 0, so results cannot be worked out. Set a ratio of 1 or more.",
    })
  })

  it('answers 422 for a cash ratio of 0 or less on this squad', async () => {
    const squad = squadAt(morning, { cashRatio: -1 })
    const { deps, reporting, tournament } = setup({ squads: [squad] })

    await expect(loadSquadResults(deps, reporting, tournament.id, squad.id)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("This squad's cash ratio is -1") as unknown,
    })
  })

  it('answers 422 when an earlier squad has a ratio of 0, and says so', async () => {
    const early = squadAt(morning, { cashRatio: 0 })
    const late = squadAt(noon)
    const { deps, reporting, tournament } = setup({ squads: [early, late] })

    await expect(loadSquadResults(deps, reporting, tournament.id, late.id)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("An earlier squad's cash ratio is 0") as unknown,
    })
  })

  it('does not mind a later squad with a ratio of 0', async () => {
    const early = squadAt(morning)
    const late = squadAt(noon, { finalsRatio: 0 })
    const { deps, reporting, tournament } = setup({ squads: [early, late] })

    await expect(loadSquadResults(deps, reporting, tournament.id, early.id)).resolves.toMatchObject(
      { divisions: [] },
    )
  })
})

describe('loadSweeperResults (RES-22 to RES-25a)', () => {
  const bonus = (division: Division, pins: number) => ({
    divisionId: division.id,
    divisionName: division.name,
    bonusPinsPerGame: pins,
  })

  it('ranks everyone in one list with bonus pins, and cuts at the last casher (SW-1, SW-6, SW-7)', async () => {
    const sweeper = createSweeper({
      cashRatio: 2,
      games: 3,
      bonusPins: [bonus(seniors, 10)],
    })
    const plain = bowler(open.id)
    const senior = bowler(seniors.id)
    const low = bowler(open.id)
    const lowest = bowler(open.id)
    const { deps, reporting, tournament } = setup({
      sweepers: [sweeper],
      divisions: [open, seniors],
      seats: [
        { sessionId: sweeper.id, entry: plain, games: [200, 200, 200] },
        { sessionId: sweeper.id, entry: senior, games: [195, 195, 195] },
        { sessionId: sweeper.id, entry: low, games: [150, 150, 150] },
        { sessionId: sweeper.id, entry: lowest, games: [100, 100, 100] },
      ],
    })

    const result = await loadSweeperResults(deps, reporting, tournament.id, sweeper.id)

    expect(sweeperResultsSchema.safeParse(result).success).toBe(true)
    expect(result).toMatchObject({ entries: 4, cashers: 2, cutScore: 600, cashRatio: 2 })
    expect(result.rows.map((row) => [row.place, row.group, row.total])).toEqual([
      [1, 'casher', 615],
      [2, 'casher', 600],
      [3, 'other', 450],
      [4, 'other', 300],
    ])
    expect(result.rows[0]).toMatchObject({
      registrationId: senior.registrationId,
      divisionName: 'Women/Senior',
      bonusPins: 10,
      games: 3,
      highGame: 205,
    })
    expect(result.rows[1]).toMatchObject({ divisionName: 'Open', bonusPins: 0 })
    expect(result.session).toEqual({
      id: sweeper.id,
      kind: 'sweeper',
      date: sweeper.date,
      complete: false,
      games: 3,
    })
  })

  it('has no rows and no cut score with no scores (SW-3, D-77)', async () => {
    const sweeper = createSweeper()
    const { deps, reporting, tournament } = setup({ sweepers: [sweeper] })

    const result = await loadSweeperResults(deps, reporting, tournament.id, sweeper.id)

    expect(result).toMatchObject({ entries: 0, cashers: 0, cutScore: null, rows: [] })
  })

  it('marks a tie across the cash line (SW-9)', async () => {
    const sweeper = createSweeper({ cashRatio: 2 })
    const seats = [
      { entry: bowler(), games: [250, 250, 250] },
      { entry: bowler(), games: [190, 195, 200] },
      { entry: bowler(), games: [196, 198, 191] },
      { entry: bowler(), games: [100, 100, 100] },
    ].map((seat) => ({ ...seat, sessionId: sweeper.id }))
    const { deps, reporting, tournament } = setup({ sweepers: [sweeper], seats })

    const result = await loadSweeperResults(deps, reporting, tournament.id, sweeper.id)

    expect(result.rows[1]?.ties).toEqual([
      { line: 'cash', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } },
    ])
    expect(result.rows[2]?.ties).toEqual([
      { line: 'cash', outcome: 'lost', decidedBy: { kind: 'game', rank: 1 } },
    ])
  })

  it('answers 404 for an unknown tournament or sweeper', async () => {
    const { deps, reporting, tournament } = setup({ sweepers: [createSweeper()] })

    await expect(
      loadSweeperResults(deps, reporting, createTournament().id, createSweeper().id),
    ).rejects.toMatchObject({ status: 404, message: 'Tournament not found' })
    await expect(
      loadSweeperResults(deps, reporting, tournament.id, createSweeper().id),
    ).rejects.toMatchObject({ status: 404, message: 'Sweeper not found' })
  })

  it('answers 422 for a cash ratio of 0 (SW-12, D-83)', async () => {
    const sweeper = createSweeper({ cashRatio: 0 })
    const { deps, reporting, tournament } = setup({ sweepers: [sweeper] })

    await expect(
      loadSweeperResults(deps, reporting, tournament.id, sweeper.id),
    ).rejects.toMatchObject({
      status: 422,
      message:
        "This sweeper's cash ratio is 0, so results cannot be worked out. Set a ratio of 1 or more.",
    })
  })

  it('skips an entry whose division is not the tournament’s (D-51)', async () => {
    const sweeper = createSweeper()
    const lost = createLaneEntry({ divisionId: createDivision().id })
    const { deps, reporting, tournament, captured } = setup({
      sweepers: [sweeper],
      seats: [{ sessionId: sweeper.id, entry: lost, games: [200] }],
    })

    const result = await loadSweeperResults(deps, reporting, tournament.id, sweeper.id)

    expect(result.rows).toEqual([])
    expect(captured.records().some((record) => record.registrationId === lost.registrationId)).toBe(
      true,
    )
  })
})
