import { describe, expect, it } from 'vitest'
import { createResultEntry } from '../../test/factories.ts'
import type { ResultEntry } from './entries.ts'
import { compareEntries, decidedBy, rankEntries } from './ranking.ts'

const entry = (games: number[], pins = 0) => createResultEntry({ games, pins })

/** `winner` ranks above `loser`, whichever way round they are compared. */
function expectAbove(winner: ResultEntry, loser: ResultEntry) {
  expect(compareEntries(winner, loser)).toBeLessThan(0)
  expect(compareEntries(loser, winner)).toBeGreaterThan(0)
}

describe('compareEntries (SCR-11)', () => {
  it('ranks more games above fewer, whatever the pins (RK-1)', () => {
    expectAbove(entry([200, 201, 202]), entry([200, 201]))
    expectAbove(entry([100, 100, 100]), entry([300, 300]))
  })

  it('ranks 3 games above 1 game (RK-2)', () => {
    expectAbove(entry([200, 200, 200]), entry([300]))
  })

  it('ranks the higher total above the lower with the same games (RK-3, RK-4)', () => {
    expectAbove(entry([200, 201, 203]), entry([200, 201, 202]))
    expectAbove(entry([200, 201, 202]), entry([200, 201, 200]))
  })

  it('breaks an equal total on the high game (RK-5, RK-6)', () => {
    expectAbove(entry([200, 201, 199]), entry([200, 200, 200]))
    expectAbove(entry([200, 199, 201]), entry([200, 200, 200]))
  })

  it('breaks an equal total and high game on the 2nd-best game (RK-7, RK-8)', () => {
    expectAbove(entry([200, 199, 201, 300]), entry([200, 200, 200, 300]))
    expectAbove(entry([200, 201, 199, 300]), entry([200, 200, 200, 300]))
  })

  it('goes on to the 3rd-best game when the first two tie (RK-9)', () => {
    expectAbove(entry([300, 250, 150, 100]), entry([300, 250, 140, 110]))
  })

  it('says 0 for a full tie (RK-10)', () => {
    expect(compareEntries(entry([200, 190, 180]), entry([180, 200, 190]))).toBe(0)
  })

  it('counts the handicap in the total (RK-11, SCR-08)', () => {
    // 600 scratch against 580 scratch + 3 x 10 = 610
    expectAbove(entry([190, 195, 195], 10), entry([200, 200, 200], 0))
  })

  it('compares the high game with pins, not the best scratch game (RK-12)', () => {
    const higherScratch = entry([250, 200, 200], 0) // total 650, high game 250
    const higherWithPins = entry([243, 187, 190], 10) // total 650, high game 253
    expectAbove(higherWithPins, higherScratch)
  })
})

describe('decidedBy (D-14, D-16)', () => {
  it('names the games bowled when totals are equal and the counts differ', () => {
    expect(decidedBy(entry([300, 300]), entry([200, 200, 200]))).toEqual({ kind: 'games' })
  })

  it('names the high game as rank 1', () => {
    expect(decidedBy(entry([36, 36, 37]), entry([35, 36, 38]))).toEqual({ kind: 'game', rank: 1 })
  })

  it('names the Nth best game', () => {
    expect(decidedBy(entry([300, 250, 150, 100]), entry([300, 250, 140, 110]))).toEqual({
      kind: 'game',
      rank: 3,
    })
  })

  it('says nothing for a full tie', () => {
    expect(decidedBy(entry([200, 190, 180]), entry([180, 200, 190]))).toBeUndefined()
  })
})

describe('rankEntries', () => {
  it('orders the same entries the same way from any input order (RK-15)', () => {
    const first = entry([40, 40, 40])
    const second = entry([39, 39, 39])
    const third = entry([38, 38, 38])
    const fourth = entry([37, 37, 37])
    const fifth = entry([36, 36, 36])

    const forward = rankEntries([first, second, third, fourth, fifth])

    expect(rankEntries([fifth, fourth, third, second, first])).toEqual(forward)
    expect(rankEntries([third, fifth, first, fourth, second])).toEqual(forward)
    expect(forward).toEqual([first, second, third, fourth, fifth])
  })

  it('keeps a full tie in a stable order: last name, first name, registration id (RK-10)', () => {
    const base = { games: [200, 200, 200] }
    const zed = createResultEntry({ ...base, lastName: 'Zed', firstName: 'Al' })
    const adamsB = createResultEntry({ ...base, lastName: 'Adams', firstName: 'Bo' })
    const adamsA = createResultEntry({ ...base, lastName: 'adams', firstName: 'Al' })
    const twinHigh = createResultEntry({
      ...base,
      lastName: 'Twin',
      firstName: 'Cy',
      registrationId: 'b0000000-0000-4000-8000-000000000000',
    })
    const twinLow = createResultEntry({
      ...base,
      lastName: 'Twin',
      firstName: 'Cy',
      registrationId: 'a0000000-0000-4000-8000-000000000000',
    })

    const ranked = rankEntries([zed, twinHigh, adamsB, twinLow, adamsA])

    expect(ranked).toEqual([adamsA, adamsB, twinLow, twinHigh, zed])
  })

  it('does not change the list it is given', () => {
    const entries = [entry([100, 100, 100]), entry([200, 200, 200])]
    const copy = [...entries]

    rankEntries(entries)

    expect(entries).toEqual(copy)
  })
})
