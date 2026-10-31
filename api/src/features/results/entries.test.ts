import { describe, expect, it } from 'vitest'
import { createDivision, createLaneEntry } from '../../test/factories.ts'
import {
  buildResultEntries,
  squadPins,
  sweeperPins,
  toResultEntry,
  type ResultEntryInput,
} from './entries.ts'

const base: ResultEntryInput = {
  registrationId: 'r',
  bowlerId: 'b',
  firstName: 'A',
  lastName: 'B',
  name: 'A B',
  divisionId: 'd',
  divisionName: 'Open',
  games: [],
  pins: 0,
}

describe('toResultEntry', () => {
  it('sums the games and takes the largest as the high game (RK-14)', () => {
    const entry = toResultEntry({ ...base, games: [200, 201, 202] })

    expect(entry.total).toBe(603)
    expect(entry.highGame).toBe(202)
    expect(entry.best).toEqual([202, 201, 200])
  })

  it('adds the handicap for each game bowled to the total and once to the high game (HD-2)', () => {
    const entry = toResultEntry({ ...base, games: [200, 200, 200], pins: 20 })

    expect(entry.total).toBe(660)
    expect(entry.highGame).toBe(220)
  })

  it('adds pins only for the games bowled (HD-5)', () => {
    expect(toResultEntry({ ...base, games: [200, 200], pins: 20 }).total).toBe(440)
  })

  it('has a high game of 0 when there are no games', () => {
    expect(toResultEntry(base).highGame).toBe(0)
  })

  it('leaves the games in the order given', () => {
    const games = [210, 190, 200]

    toResultEntry({ ...base, games })

    expect(games).toEqual([210, 190, 200])
  })
})

describe('buildResultEntries', () => {
  const open = createDivision({
    name: 'Open',
    handicapBase: 220,
    handicapPercentage: 90,
    maximumHandicapPerGame: 50,
  })

  it('makes an entry of each bowler with a score, with the games in game order (RES-02)', () => {
    const bowler = createLaneEntry({ divisionId: open.id })
    const quiet = createLaneEntry({ divisionId: open.id })

    const { entries } = buildResultEntries(
      [bowler, quiet],
      [
        { bowlerId: bowler.bowlerId, game: 2, score: 210 },
        { bowlerId: bowler.bowlerId, game: 1, score: 190 },
      ],
      [open],
      () => 0,
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      registrationId: bowler.registrationId,
      divisionName: 'Open',
      games: [190, 210],
    })
  })

  it('counts a stored zero as a score, so a no-show is an entry (D-06)', () => {
    const bowler = createLaneEntry({ divisionId: open.id })

    const { entries } = buildResultEntries(
      [bowler],
      [{ bowlerId: bowler.bowlerId, game: 1, score: 0 }],
      [open],
      () => 0,
    )

    expect(entries).toHaveLength(1)
  })

  it('ignores a score for a bowler who is not entered (SQ-20)', () => {
    const { entries } = buildResultEntries(
      [],
      [{ bowlerId: 'someone-else', game: 1, score: 200 }],
      [open],
      () => 0,
    )

    expect(entries).toEqual([])
  })

  it('skips an entry whose division is not the tournament’s and reports it (FL-9, D-51)', () => {
    const lost = createLaneEntry({ divisionId: 'not-a-division' })

    const { entries, skipped } = buildResultEntries(
      [lost],
      [{ bowlerId: lost.bowlerId, game: 1, score: 200 }],
      [open],
      () => 0,
    )

    expect(entries).toEqual([])
    expect(skipped).toEqual([lost.registrationId])
  })

  it('uses the pins function for each entry', () => {
    const bowler = createLaneEntry({ divisionId: open.id, average: 150 })

    const { entries } = buildResultEntries(
      [bowler],
      [{ bowlerId: bowler.bowlerId, game: 1, score: 200 }],
      [open],
      squadPins,
    )

    expect(entries[0]?.pins).toBe(50)
    expect(entries[0]?.total).toBe(250)
  })
})

describe('squadPins and sweeperPins', () => {
  it('gives a squad entry the handicap per game (SCR-07)', () => {
    const division = createDivision({
      handicapBase: 220,
      handicapPercentage: 90,
      maximumHandicapPerGame: 50,
    })

    expect(squadPins(createLaneEntry({ average: 200 }), division)).toBe(18)
  })

  it('gives a sweeper entry the bonus pins of its division, 0 when it has no row (HD-3, HD-4)', () => {
    const women = createDivision({ name: 'Women/Senior' })
    const open = createDivision({ name: 'Open' })
    const pins = sweeperPins([
      { divisionId: women.id, divisionName: women.name, bonusPinsPerGame: 10 },
    ])
    const entry = createLaneEntry()

    expect(pins(entry, women)).toBe(10)
    expect(pins(entry, open)).toBe(0)
  })

  it('totals a sweeper entry as scratch plus bonus pins for each game (HD-3)', () => {
    const division = createDivision()
    const pins = sweeperPins([
      { divisionId: division.id, divisionName: division.name, bonusPinsPerGame: 10 },
    ])
    const bowler = createLaneEntry({ divisionId: division.id })

    const { entries } = buildResultEntries(
      [bowler],
      [
        { bowlerId: bowler.bowlerId, game: 1, score: 200 },
        { bowlerId: bowler.bowlerId, game: 2, score: 190 },
      ],
      [division],
      pins,
    )

    expect(entries[0]?.total).toBe(410)
  })
})
