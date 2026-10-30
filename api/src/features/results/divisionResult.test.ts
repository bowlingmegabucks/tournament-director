import { describe, expect, it } from 'vitest'
import { createDivision, createResultEntry } from '../../test/factories.ts'
import { toDivisionResult } from './divisionResult.ts'
import type { ResultEntry } from './entries.ts'
import { workOutDivision, type DivisionInput } from './squadResults.ts'
import { markTies } from './ties.ts'

const division = createDivision({ number: 3, name: 'Open' })
const flat = (score: number, pins = 0) => createResultEntry({ games: [score, score, score], pins })

function build(entries: ResultEntry[], over: Partial<DivisionInput> = {}) {
  const input: DivisionInput = {
    entries,
    advancedBefore: new Set(),
    finalsRatio: 8,
    cashRatio: 5,
    games: 3,
    complete: false,
    ...over,
  }
  const outcome = workOutDivision(input)
  return toDivisionResult(
    division,
    outcome,
    markTies(outcome, input.advancedBefore),
    input.advancedBefore,
  )
}

const forty = () => Array.from({ length: 40 }, (_, index) => flat(40 - index))

describe('toDivisionResult', () => {
  it('names the division and counts its entries', () => {
    const result = build(forty())

    expect(result).toMatchObject({ id: division.id, number: 3, name: 'Open', entries: 40 })
  })

  it('numbers places 1 to N through advancers, cashers, and the rest, with the group (SQ-22, RK-13)', () => {
    const result = build(forty())

    expect(result.rows.map((row) => row.place)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
    expect(result.rows.map((row) => row.group)).toEqual([
      ...Array<string>(5).fill('advancer'),
      ...Array<string>(3).fill('casher'),
      ...Array<string>(32).fill('other'),
    ])
  })

  it('gives a tied bowler a place of their own (RK-13, SCR-12)', () => {
    const tied = [flat(100), flat(100), flat(90)]

    const result = build(tied)

    expect(result.rows.map((row) => row.place)).toEqual([1, 2, 3])
  })

  it('carries the figures of a row: total, high game, games, and handicap (RW-1)', () => {
    const result = build([createResultEntry({ games: [200, 210, 190], pins: 12 })])

    expect(result.rows[0]).toMatchObject({
      total: 636,
      highGame: 222,
      games: 3,
      handicap: 12,
      ties: [],
    })
  })

  it('tags an earlier advancer at or above the cut and no other (RW-5, SQ-23)', () => {
    const earlier = flat(300)
    const lowEarlier = flat(1)
    const rest = Array.from({ length: 22 }, (_, index) => flat(100 - index))

    const result = build([earlier, lowEarlier, ...rest], {
      cashRatio: 4.5,
      advancedBefore: new Set([earlier.bowlerId, lowEarlier.bowlerId]),
    })

    const tagged = result.rows.filter((row) => row.advancedEarlier)
    expect(tagged.map((row) => row.registrationId)).toEqual([earlier.registrationId])
    expect(result.rows.find((row) => row.registrationId === earlier.registrationId)).toMatchObject({
      place: 4,
      group: 'casher',
    })
  })

  it('does not tag an earlier advancer who cashes below the cut (SQ-24)', () => {
    const advancers = [flat(247), flat(240), flat(238)]
    const ed = flat(235)
    const ray = flat(233)
    const rest = Array.from({ length: 19 }, (_, index) => flat(100 - index))

    const result = build([...advancers, ed, ray, ...rest], {
      cashRatio: 4.5,
      advancedBefore: new Set([ed.bowlerId]),
    })

    const row = result.rows.find((item) => item.registrationId === ed.registrationId)
    expect(row).toMatchObject({ group: 'casher', advancedEarlier: false })
  })

  it('does not tag anyone when no one advances, so there is no cut (SQ-15)', () => {
    const earlier = flat(300)

    const result = build([earlier, flat(40), flat(39)], {
      advancedBefore: new Set([earlier.bowlerId]),
    })

    expect(result.rows[0]).toMatchObject({ group: 'casher', advancedEarlier: false })
  })

  it('shows the handicap column only when someone in the division has a handicap above 0 (RW-2, RW-3)', () => {
    expect(build([flat(200), flat(190)]).showHandicap).toBe(false)
    expect(build([flat(200), flat(190, 12)]).showHandicap).toBe(true)
  })

  it('counts a handicap held by a bowler listed apart', () => {
    const quit = createResultEntry({ games: [200], pins: 10 })

    const result = build([flat(200), quit], { complete: true })

    expect(result.showHandicap).toBe(true)
  })

  it('shows the games column only while the game counts differ (RW-4, D-76)', () => {
    const same = build([flat(200), flat(190)])
    const mixed = build([flat(200), createResultEntry({ games: [250, 250] })])

    expect(same.showGames).toBe(false)
    expect(mixed.showGames).toBe(true)
  })

  it('hides the games column on a complete squad, where the short games are listed apart (D-75, D-76)', () => {
    const result = build([flat(200), createResultEntry({ games: [250, 250] })], { complete: true })

    expect(result.showGames).toBe(false)
    expect(result.didNotFinish).toHaveLength(1)
  })

  it('lists a bowler who did not finish with the figures but no place (DN-1)', () => {
    const quit = createResultEntry({ games: [210, 230], pins: 5 })

    const result = build([flat(200), quit], { complete: true })

    expect(result.didNotFinish).toEqual([
      {
        registrationId: quit.registrationId,
        name: quit.name,
        total: 450,
        highGame: 235,
        games: 2,
        handicap: 5,
      },
    ])
    expect(result.rows.map((row) => row.registrationId)).not.toContain(quit.registrationId)
  })

  it('lists a no-show by name only (DN-2)', () => {
    const absent = createResultEntry({ games: [0, 0, 0] })

    const result = build([flat(200), absent], { complete: true })

    expect(result.noShows).toEqual([{ registrationId: absent.registrationId, name: absent.name }])
  })

  it('attaches the tie marks to the rows (TI-1)', () => {
    const winner = createResultEntry({ games: [35, 36, 38] })
    const loser = createResultEntry({ games: [36, 36, 37] })
    const tail = Array.from({ length: 34 }, (_, index) => flat(34 - index))

    const result = build([...[140, 139, 138, 137].map((n) => flat(n)), winner, loser, ...tail])

    const marks = Object.fromEntries(result.rows.map((row) => [row.registrationId, row.ties]))
    expect(marks[winner.registrationId]).toHaveLength(1)
    expect(marks[loser.registrationId]).toHaveLength(1)
  })
})
