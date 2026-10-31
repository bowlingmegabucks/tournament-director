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
import { createInMemoryScoreRepository } from '../scores/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import type { Squad } from '../squads/types.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import type { Sweeper } from '../sweepers/types.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import type { TournamentRatios } from '../tournaments/types.ts'
import { loadAtLarge, loadSeeding, loadSuperSweeper } from './loadFinals.ts'
import type { ResultsDeps } from './loadResults.ts'

const open = createDivision({ number: 1, name: 'Open' })
const women = createDivision({ number: 2, name: 'Women' })

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
  ratios?: TournamentRatios
}) {
  const tournament = createTournament()
  const seats = options.seats ?? []
  const deps: ResultsDeps = {
    tournaments: createInMemoryTournamentRepository(
      [tournament],
      options.ratios && { [tournament.id]: options.ratios },
    ),
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
    scores: createInMemoryScoreRepository(
      seats.flatMap(({ sessionId, entry, games }) =>
        games.map((score, index) => ({
          sessionId,
          score: { bowlerId: entry.bowlerId, game: index + 1, score },
        })),
      ),
    ),
  }
  const captured = createCapturedLogger()
  const reporting = { logger: captured.logger, reported: new Set<string>() }
  return { deps, reporting, tournament, captured }
}

const bowler = (over: Partial<LaneEntry> = {}) =>
  createLaneEntry({ divisionId: open.id, average: null, ...over })

/** A squad whose own finals ratio is 6, so one of six advances; cashers are few. */
const squadAt = (date: string, over: Partial<Squad> = {}) =>
  createSquad({ date, finalsRatio: 6, cashRatio: 100, games: 3, complete: true, ...over })

const morning = '2026-10-24T09:00:00'
const noon = '2026-10-24T13:00:00'

/** Six bowlers at these totals, each with 3 games of a third of it. */
function sixBowlers(sessionId: string, totals = [750, 700, 690, 600, 590, 580]) {
  const entries = totals.map(() => bowler())
  const seats = entries.map((entry, index) => ({
    sessionId,
    entry,
    games: Array.from({ length: 3 }, () => (totals[index] ?? 0) / 3),
  }))
  return { entries, seats }
}

describe('loadAtLarge', () => {
  it('uses the tournament finals ratio, not the squad’s own (AL-10, RES-12, D-86)', async () => {
    const squad = squadAt(morning) // its own ratio 6 gives 1 advancer
    const { entries, seats } = sixBowlers(squad.id)
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats,
      ratios: { finalsRatio: 2, superSweeperCashRatio: 5 },
    })

    const result = await loadAtLarge(deps, reporting, tournament.id)

    expect(result.finalsRatio).toBe(2)
    const division = result.divisions[0]
    expect(division).toMatchObject({
      name: 'Open',
      entries: 6,
      totalSpots: 3,
      squadAdvancers: 1,
      atLargeSpots: 2,
    })
    expect(division?.rows.map((row) => row.registrationId)).toEqual([
      entries[1]?.registrationId,
      entries[2]?.registrationId,
    ])
    expect(division?.rows.map((row) => row.place)).toEqual([1, 2])
    expect(division?.rows[0]).toMatchObject({
      total: 700,
      highGame: expectHigh(700),
      squadDate: morning,
    })
  })

  it('is complete only when there are squads and every one is complete (AL-14, D-88)', async () => {
    const ratios = { finalsRatio: 2, superSweeperCashRatio: 5 }
    const done = squadAt(morning)
    const running = squadAt(noon, { complete: false })

    const none = setup({ ratios })
    const all = setup({ squads: [done], ratios })
    const some = setup({ squads: [done, running], ratios })

    expect((await loadAtLarge(none.deps, none.reporting, none.tournament.id)).complete).toBe(false)
    expect((await loadAtLarge(all.deps, all.reporting, all.tournament.id)).complete).toBe(true)
    expect((await loadAtLarge(some.deps, some.reporting, some.tournament.id)).complete).toBe(false)
  })

  it('lists no division when nobody has a score', async () => {
    const { deps, reporting, tournament } = setup({ squads: [squadAt(morning)] })

    expect((await loadAtLarge(deps, reporting, tournament.id)).divisions).toEqual([])
  })

  it('lists divisions by name, each worked out alone (AL-12)', async () => {
    const squad = squadAt(morning)
    const six = sixBowlers(squad.id)
    const womenSeats = [750, 700, 690, 600, 590, 580].map((total) => ({
      sessionId: squad.id,
      entry: bowler({ divisionId: women.id }),
      games: [total / 3, total / 3, total / 3],
    }))
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats: [...womenSeats, ...six.seats],
      divisions: [women, open],
      ratios: { finalsRatio: 2, superSweeperCashRatio: 5 },
    })

    const result = await loadAtLarge(deps, reporting, tournament.id)

    expect(result.divisions.map((division) => division.name)).toEqual(['Open', 'Women'])
  })

  it('works out each division with the tournament ratio and its own entries: 5 and 6 entries at ratio 5 (AL-5)', async () => {
    const squad = squadAt(morning)
    const seat = (divisionId: string, score: number) => ({
      sessionId: squad.id,
      entry: bowler({ divisionId }),
      games: [score, score, score],
    })
    const openSeats = [100, 110, 120, 130, 140].map((score) => seat(open.id, score))
    const womenSeats = [100, 110, 120, 130, 140, 150].map((score) => seat(women.id, score))
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats: [...openSeats, ...womenSeats],
      divisions: [open, women],
      ratios: { finalsRatio: 5, superSweeperCashRatio: 5 },
    })

    const result = await loadAtLarge(deps, reporting, tournament.id)

    expect(
      result.divisions.map((division) => [division.name, division.entries, division.totalSpots]),
    ).toEqual([
      ['Open', 5, 1],
      ['Women', 6, 1],
    ])
  })

  it('numbers the places from 1 in each division and flags only the bowler who cashed (AL-4, AL-13)', async () => {
    const squad = squadAt(morning, { cashRatio: 3 })
    const seatsFor = (divisionId: string) =>
      [750, 700, 690, 600, 590, 580].map((total) => ({
        sessionId: squad.id,
        entry: bowler({ divisionId }),
        games: [total / 3, total / 3, total / 3],
      }))
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats: [...seatsFor(open.id), ...seatsFor(women.id)],
      divisions: [open, women],
      ratios: { finalsRatio: 2, superSweeperCashRatio: 5 },
    })

    const result = await loadAtLarge(deps, reporting, tournament.id)

    // Two spots per division: 700 cashed on the squad, 690 did not.
    expect(result.divisions.map((division) => division.rows.map((row) => row.place))).toEqual([
      [1, 2],
      [1, 2],
    ])
    expect(
      result.divisions.map((division) => division.rows.map((row) => row.previousCasher)),
    ).toEqual([
      [true, false],
      [true, false],
    ])
  })

  it('marks a tie for the last at-large spot with the tie-breaker (AL-11, D-93)', async () => {
    const squad = squadAt(morning)
    const entries = [bowler(), bowler(), bowler(), bowler(), bowler(), bowler()]
    const games = [
      [250, 250, 250],
      [35, 36, 38],
      [36, 36, 37],
      [10, 10, 10],
      [9, 9, 9],
      [8, 8, 8],
    ]
    const seats = entries.map((entry, index) => ({
      sessionId: squad.id,
      entry,
      games: games[index] ?? [],
    }))
    // S = 6 / 3 = 2, Q = 1 (squad ratio 6): one at-large spot, 109 against 109 for it.
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats,
      ratios: { finalsRatio: 3, superSweeperCashRatio: 5 },
    })

    const result = await loadAtLarge(deps, reporting, tournament.id)

    const rows = result.divisions[0]?.rows ?? []
    expect(rows).toHaveLength(1)
    expect(rows[0]?.ties).toEqual([
      { line: 'cut', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } },
    ])
  })

  it('flags an at-large advancer who cashed on a squad (RES-16, D-07)', async () => {
    const squad = squadAt(morning, { cashRatio: 2 })
    const { entries, seats } = sixBowlers(squad.id)
    // Squad ratios: finals 6 (A = 1), cash 2 (C = 3 - 1 = 2): the 2nd and 3rd cash.
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats,
      ratios: { finalsRatio: 2, superSweeperCashRatio: 5 },
    })

    const result = await loadAtLarge(deps, reporting, tournament.id)

    const rows = result.divisions[0]?.rows ?? []
    expect(rows.map((row) => row.registrationId)).toEqual([
      entries[1]?.registrationId,
      entries[2]?.registrationId,
    ])
    expect(rows.every((row) => row.previousCasher)).toBe(true)
  })

  it('answers 404 for an unknown tournament', async () => {
    const { deps, reporting } = setup({})

    await expect(
      loadAtLarge(deps, reporting, '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'),
    ).rejects.toMatchObject({ status: 404, message: 'Tournament not found' })
  })

  it('answers 404 when the tournament has no ratios', async () => {
    const { deps, reporting, tournament } = setup({})
    deps.tournaments = { ...deps.tournaments, getRatios: () => Promise.resolve(undefined) }

    await expect(loadAtLarge(deps, reporting, tournament.id)).rejects.toMatchObject({
      status: 404,
      message: 'Tournament not found',
    })
  })

  it.each([
    [
      'tournament finals ratio',
      { finalsRatio: 0, superSweeperCashRatio: 5 },
      undefined,
      "This tournament's finals ratio is 0, so results cannot be worked out. Set a ratio of 1 or more.",
    ],
    [
      'squad finals ratio',
      undefined,
      { finalsRatio: 0 },
      "A squad's finals ratio is 0, so results cannot be worked out. Set a ratio of 1 or more.",
    ],
    [
      'squad cash ratio',
      undefined,
      { cashRatio: -1 },
      "A squad's cash ratio is -1, so results cannot be worked out. Set a ratio of 1 or more.",
    ],
  ])('answers 422 for a %s of 0 or less (D-93)', async (_name, ratios, squadOver, message) => {
    const squad = squadAt(morning, squadOver)
    const { deps, reporting, tournament } = setup({ squads: [squad], ratios })

    const error = await loadAtLarge(deps, reporting, tournament.id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 422, message })
  })

  it('lists divisions of one name by number', async () => {
    const squad = squadAt(morning)
    const second = createDivision({ number: 2, name: 'Open' })
    const first = createDivision({ number: 1, name: 'Open' })
    const seat = (divisionId: string) => ({
      sessionId: squad.id,
      entry: bowler({ divisionId }),
      games: [200, 200, 200],
    })
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats: [seat(second.id), seat(first.id)],
      divisions: [second, first],
    })

    const result = await loadAtLarge(deps, reporting, tournament.id)

    expect(result.divisions.map((division) => division.number)).toEqual([1, 2])
  })

  it('skips an entry whose division is not the tournament’s and logs it once (D-51)', async () => {
    const squad = squadAt(morning)
    const stray = bowler({ divisionId: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a09' })
    const { deps, reporting, tournament, captured } = setup({
      squads: [squad],
      seats: [{ sessionId: squad.id, entry: stray, games: [200, 200, 200] }],
    })

    await loadAtLarge(deps, reporting, tournament.id)
    await loadAtLarge(deps, reporting, tournament.id)

    expect(
      captured.records().filter((record) => record.registrationId === stray.registrationId),
    ).toHaveLength(1)
  })
})

/** The high game of a bowler whose three games are equal. */
const expectHigh = (total: number) => total / 3

describe('loadSeeding', () => {
  it('seeds the squad advancer and the at-large advancers, then the rest (RES-18, RES-20)', async () => {
    const squad = squadAt(morning)
    const { entries, seats } = sixBowlers(squad.id)
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats,
      ratios: { finalsRatio: 2, superSweeperCashRatio: 5 },
    })

    const result = await loadSeeding(deps, reporting, tournament.id)

    const division = result.divisions[0]
    expect(division).toMatchObject({ entries: 6, finalists: 3, atLarge: 2, showHandicap: false })
    expect(division?.rows.map((row) => [row.seed, row.group])).toEqual([
      [1, 'finalist'],
      [2, 'finalist'],
      [3, 'finalist'],
      [4, 'other'],
      [5, 'other'],
      [6, 'other'],
    ])
    expect(division?.rows.map((row) => row.registrationId)).toEqual(
      entries.map((entry) => entry.registrationId),
    )
    expect(division?.rows[0]).toMatchObject({
      squadDate: morning,
      handicap: 0,
      previousCasher: false,
    })
  })

  it('shows the squad of the best entry and a handicap when someone has one (D-92, SD-3)', async () => {
    const early = squadAt(morning)
    const late = squadAt(noon)
    const handicapDivision = createDivision({
      number: 1,
      name: 'Open',
      handicapBase: 200,
      handicapPercentage: 100,
      maximumHandicapPerGame: 50,
    })
    const star = bowler({ average: 180, divisionId: handicapDivision.id })
    // One bowler has no average, so no handicap: the column shows when only some have one.
    const rest = [
      ...Array.from({ length: 4 }, () => bowler({ average: 180, divisionId: handicapDivision.id })),
      bowler({ average: null, divisionId: handicapDivision.id }),
    ]
    const seats = [
      { sessionId: early.id, entry: star, games: [250, 250, 250] },
      ...rest.map((entry) => ({ sessionId: early.id, entry, games: [100, 100, 100] })),
      { sessionId: late.id, entry: star, games: [280, 280, 280] },
      ...rest.map((entry) => ({ sessionId: late.id, entry, games: [90, 90, 90] })),
    ]
    const { deps, reporting, tournament } = setup({
      squads: [early, late],
      seats,
      divisions: [handicapDivision],
      ratios: { finalsRatio: 12, superSweeperCashRatio: 5 },
    })

    const result = await loadSeeding(deps, reporting, tournament.id)

    const row = result.divisions[0]?.rows[0]
    expect(row).toMatchObject({ registrationId: star.registrationId, seed: 1, squadDate: noon })
    expect(result.divisions[0]?.showHandicap).toBe(true)
    expect(row?.handicap).toBeGreaterThan(0)
  })

  it('numbers the seeds from 1 in each division, finalists first (SD-1)', async () => {
    const squad = squadAt(morning)
    const seatsFor = (divisionId: string) =>
      [750, 700, 690, 600, 590, 580].map((total) => ({
        sessionId: squad.id,
        entry: bowler({ divisionId }),
        games: [total / 3, total / 3, total / 3],
      }))
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats: [...seatsFor(open.id), ...seatsFor(women.id)],
      divisions: [open, women],
      ratios: { finalsRatio: 2, superSweeperCashRatio: 5 },
    })

    const result = await loadSeeding(deps, reporting, tournament.id)

    for (const division of result.divisions) {
      expect(division.rows.map((row) => row.seed)).toEqual([1, 2, 3, 4, 5, 6])
      expect(division.rows.map((row) => row.total)).toEqual([750, 700, 690, 600, 590, 580])
    }
  })

  it('carries the complete flag (SD-7, D-88)', async () => {
    const running = squadAt(morning, { complete: false })
    const { deps, reporting, tournament } = setup({ squads: [running] })

    expect((await loadSeeding(deps, reporting, tournament.id)).complete).toBe(false)
  })

  it('flags a finalist who took an at-large spot and cashed (RES-21)', async () => {
    const squad = squadAt(morning, { cashRatio: 2 })
    const { seats } = sixBowlers(squad.id)
    const { deps, reporting, tournament } = setup({
      squads: [squad],
      seats,
      ratios: { finalsRatio: 2, superSweeperCashRatio: 5 },
    })

    const result = await loadSeeding(deps, reporting, tournament.id)

    expect(result.divisions[0]?.rows.map((row) => row.previousCasher)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
    ])
  })

  it('answers 422 for a tournament finals ratio of 0 (D-93)', async () => {
    const { deps, reporting, tournament } = setup({
      squads: [squadAt(morning)],
      ratios: { finalsRatio: 0, superSweeperCashRatio: 5 },
    })

    await expect(loadSeeding(deps, reporting, tournament.id)).rejects.toMatchObject({ status: 422 })
  })
})

describe('loadSuperSweeper', () => {
  const sweeperAt = (date: string, over: Partial<Sweeper> = {}) =>
    createSweeper({ date, games: 3, complete: true, cashRatio: 2, ...over })

  function bowlers(count: number) {
    return Array.from({ length: count }, () => bowler({ superSweeper: true }))
  }

  it('builds one column for each sweeper and a row for each bowler (SS-1, RES-26)', async () => {
    const first = sweeperAt(morning)
    const second = sweeperAt(noon)
    const [a, b, c, d] = bowlers(4)
    if (!a || !b || !c || !d) throw new Error('no bowlers')
    const seats = [first, second].flatMap((sweeper) =>
      [a, b, c, d].map((entry, index) => ({
        sessionId: sweeper.id,
        entry,
        games: Array.from({ length: 3 }, () => 100 + index * 10),
      })),
    )
    const { deps, reporting, tournament } = setup({
      sweepers: [first, second],
      seats,
      ratios: { finalsRatio: 8, superSweeperCashRatio: 2 },
    })

    const result = await loadSuperSweeper(deps, reporting, tournament.id)

    expect(result.rows.map((row) => row.place)).toEqual([1, 2, 3, 4])
    expect(result.sweepers).toEqual([
      { id: first.id, date: morning, games: 3, complete: true },
      { id: second.id, date: noon, games: 3, complete: true },
    ])
    expect(result).toMatchObject({ complete: true, cashRatio: 2, entries: 4, cashers: 2 })
    expect(result.rows.map((row) => row.registrationId)).toEqual([
      d.registrationId,
      c.registrationId,
      b.registrationId,
      a.registrationId,
    ])
    expect(result.rows[0]).toMatchObject({
      place: 1,
      group: 'casher',
      total: 780,
      sweeperTotals: [390, 390],
      games: 6,
      flags: [],
    })
    expect(result.rows[2]).toMatchObject({ place: 3, group: 'other' })
    expect(result.cutScore).toBe(720)
  })

  it('marks a missed sweeper and zero-fills it (SS-8, D-90)', async () => {
    const first = sweeperAt(morning)
    const second = sweeperAt(noon)
    const [a, b] = bowlers(2)
    if (!a || !b) throw new Error('no bowlers')
    const seats = [
      { sessionId: first.id, entry: a, games: [200, 200, 200] },
      { sessionId: first.id, entry: b, games: [150, 150, 150] },
      { sessionId: second.id, entry: b, games: [150, 150, 150] },
    ]
    const { deps, reporting, tournament } = setup({
      sweepers: [first, second],
      seats,
      ratios: { finalsRatio: 8, superSweeperCashRatio: 2 },
    })

    const result = await loadSuperSweeper(deps, reporting, tournament.id)

    const missed = result.rows.find((row) => row.registrationId === a.registrationId)
    expect(missed).toMatchObject({
      sweeperTotals: [600, 0],
      total: 600,
      flags: [{ kind: 'missed', sweeperId: second.id, gamesBowled: 0 }],
    })
  })

  it('is not complete while a sweeper is open, and shows a null total there (D-88)', async () => {
    const done = sweeperAt(morning)
    const running = sweeperAt(noon, { complete: false })
    const [a] = bowlers(1)
    if (!a) throw new Error('no bowler')
    const { deps, reporting, tournament } = setup({
      sweepers: [done, running],
      seats: [
        { sessionId: done.id, entry: a, games: [200, 200, 200] },
        { sessionId: running.id, entry: a, games: [] },
      ],
      ratios: { finalsRatio: 8, superSweeperCashRatio: 2 },
    })

    const result = await loadSuperSweeper(deps, reporting, tournament.id)

    expect(result.complete).toBe(false)
    expect(result.rows[0]?.sweeperTotals).toEqual([600, null])
  })

  it('is not complete with no sweepers, and lists nobody (SS-3)', async () => {
    const { deps, reporting, tournament } = setup({})

    const result = await loadSuperSweeper(deps, reporting, tournament.id)

    expect(result).toMatchObject({ complete: false, entries: 0, cashers: 0, cutScore: null })
    expect(result.rows).toEqual([])
    expect(result.sweepers).toEqual([])
  })

  it('answers 422 when the cash ratio is the legacy 0 (SS-10, D-17, D-93)', async () => {
    const { deps, reporting, tournament } = setup({
      ratios: { finalsRatio: 8, superSweeperCashRatio: 0 },
    })

    await expect(loadSuperSweeper(deps, reporting, tournament.id)).rejects.toMatchObject({
      status: 422,
      message:
        "This tournament's super sweeper cash ratio is 0, so results cannot be worked out. Set a ratio of 1 or more.",
    })
  })

  it('cashes everyone with a ratio of 1 (SS-11)', async () => {
    const sweeper = sweeperAt(morning)
    const entries = bowlers(3)
    const { deps, reporting, tournament } = setup({
      sweepers: [sweeper],
      seats: entries.map((entry, index) => ({
        sessionId: sweeper.id,
        entry,
        games: [100 + index, 100, 100],
      })),
      ratios: { finalsRatio: 8, superSweeperCashRatio: 1 },
    })

    const result = await loadSuperSweeper(deps, reporting, tournament.id)

    expect(result.cashers).toBe(3)
    expect(result.rows.every((row) => row.group === 'casher')).toBe(true)
  })

  it('marks a tie at the cash line (D-93)', async () => {
    const sweeper = sweeperAt(morning)
    const [top, winner, loser, last] = bowlers(4)
    if (!top || !winner || !loser || !last) throw new Error('no bowlers')
    const { deps, reporting, tournament } = setup({
      sweepers: [sweeper],
      seats: [
        { sessionId: sweeper.id, entry: top, games: [250, 250, 250] },
        { sessionId: sweeper.id, entry: winner, games: [35, 36, 38] },
        { sessionId: sweeper.id, entry: loser, games: [36, 36, 37] },
        { sessionId: sweeper.id, entry: last, games: [10, 10, 10] },
      ],
      ratios: { finalsRatio: 8, superSweeperCashRatio: 2 },
    })

    const result = await loadSuperSweeper(deps, reporting, tournament.id)

    expect(result.rows[1]?.ties).toEqual([
      { line: 'cash', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } },
    ])
    expect(result.rows[2]?.ties).toEqual([
      { line: 'cash', outcome: 'lost', decidedBy: { kind: 'game', rank: 1 } },
    ])
  })

  it('answers 404 for an unknown tournament', async () => {
    const { deps, reporting } = setup({})

    await expect(
      loadSuperSweeper(deps, reporting, '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'),
    ).rejects.toMatchObject({ status: 404, message: 'Tournament not found' })
  })

  it('answers 404 when the ratios are missing', async () => {
    const { deps, reporting, tournament } = setup({})

    deps.tournaments = { ...deps.tournaments, getRatios: () => Promise.resolve(undefined) }
    await expect(loadSuperSweeper(deps, reporting, tournament.id)).rejects.toMatchObject({
      status: 404,
      message: 'Tournament not found',
    })
  })

  it('skips a registrant whose division is not the tournament’s and logs it (D-51)', async () => {
    const sweeper = sweeperAt(morning)
    const stray = bowler({ superSweeper: true, divisionId: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a09' })
    const { deps, reporting, tournament, captured } = setup({
      sweepers: [sweeper],
      seats: [{ sessionId: sweeper.id, entry: stray, games: [200, 200, 200] }],
      ratios: { finalsRatio: 8, superSweeperCashRatio: 2 },
    })

    const result = await loadSuperSweeper(deps, reporting, tournament.id)

    expect(result.rows).toEqual([])
    expect(
      captured.records().some((record) => record.registrationId === stray.registrationId),
    ).toBe(true)
  })
})
