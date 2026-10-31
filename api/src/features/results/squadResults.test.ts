import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createResultEntry } from '../../test/factories.ts'
import type { ResultEntry } from './entries.ts'
import { workOutDivision, type DivisionInput } from './squadResults.ts'

/** A bowler with the same score in each of three games, as the legacy tests build them. */
const flat = (score: number) => createResultEntry({ games: [score, score, score] })
const bowler = (games: number[]) => createResultEntry({ games })

/** Legacy shuffles its input: the order bowlers arrive in must not change the result. */
const shuffled = (entries: ResultEntry[]) => faker.helpers.shuffle(entries)

function work(entries: ResultEntry[], over: Partial<DivisionInput> = {}) {
  return workOutDivision({
    entries: shuffled(entries),
    advancedBefore: new Set(),
    finalsRatio: 8,
    cashRatio: 5,
    games: 3,
    complete: false,
    ...over,
  })
}

const ids = (entries: ResultEntry[]) => entries.map((entry) => entry.bowlerId)

/** Bowlers scoring 40, 39, ... down to 1, three games each. */
const forty = () => Array.from({ length: 40 }, (_, index) => flat(40 - index))

describe('workOutDivision: spots (RES-04, RES-05)', () => {
  it('lets the top 5 advance and the next 3 cash from 40 entries (SQ-1)', () => {
    const bowlers = forty()

    const result = work(bowlers)

    expect(result.advanceSpots).toBe(5)
    expect(result.cashSpots).toBe(3)
    expect(ids(result.advancers)).toEqual(ids(bowlers.slice(0, 5)))
    expect(ids(result.cashers)).toEqual(ids(bowlers.slice(5, 8)))
    expect(result.others).toHaveLength(32)
  })

  it('has no advancers and one casher from 4 entries (SQ-5, D-08)', () => {
    const bowlers = [flat(40), flat(39), flat(38), flat(37)]

    const result = work(bowlers)

    expect(result.advancers).toEqual([])
    expect(ids(result.cashers)).toEqual(ids(bowlers.slice(0, 1)))
    expect(result.others).toHaveLength(3)
    expect(result.cutTotal).toBeUndefined()
  })

  it('has no advancers and one casher from 6 entries, more than the cash ratio (SQ-6)', () => {
    const bowlers = [40, 39, 38, 37, 36, 35].map(flat)

    const result = work(bowlers)

    expect(result.advancers).toEqual([])
    expect(ids(result.cashers)).toEqual(ids(bowlers.slice(0, 1)))
    expect(result.others).toHaveLength(5)
  })

  it('pays one spot when no one advances, even if the cash ratio allows 2 (SQ-7, D-08)', () => {
    const bowlers = [70, 60, 50, 40, 30, 20, 10].map(flat)

    const result = work(bowlers, { cashRatio: 3 })

    expect(result.cashers).toHaveLength(1)
  })

  it('rounds the advance spots down (SQ-8)', () => {
    const bowlers = Array.from({ length: 39 }, (_, index) => flat(39 - index))

    const result = work(bowlers)

    expect(result.advanceSpots).toBe(4)
    expect(result.advancers).toHaveLength(4)
  })

  it('uses fractional ratios (SQ-9)', () => {
    const bowlers = Array.from({ length: 24 }, (_, index) => flat(24 - index))

    const result = work(bowlers, { finalsRatio: 8, cashRatio: 4.5 })

    expect(result.advanceSpots).toBe(3)
    expect(result.cashSpots).toBe(2)
    expect(result.cashers).toHaveLength(2)
  })

  it('never gives a negative number of cash spots', () => {
    const bowlers = forty()

    const result = work(bowlers, { finalsRatio: 2, cashRatio: 40 })

    expect(result.advanceSpots).toBe(20)
    expect(result.cashSpots).toBe(0)
    expect(result.cashers).toEqual([])
  })

  it('counts every bowler once across the three lists', () => {
    const result = work(forty())

    expect(result.advancers.length + result.cashers.length + result.others.length).toBe(40)
  })
})

describe('workOutDivision: ties (SQ-2, SQ-3, SQ-4)', () => {
  /** 40 bowlers from the legacy ties tests: two lists of fixed bowlers, then 34 down to 1. */
  const tail = (from: number) => Array.from({ length: from }, (_, index) => flat(from - index))

  it('settles a tie for the last advancing spot on high game and does not widen it (SQ-2)', () => {
    const top = [140, 139, 138, 137].map(flat)
    const winner = bowler([35, 36, 38])
    const loser = bowler([36, 36, 37])
    const bowlers = [...top, winner, loser, ...tail(34)]

    const result = work(bowlers)

    expect(ids(result.advancers)).toEqual(ids([...top, winner]))
    expect(result.advancers).toHaveLength(5)
    expect(result.cashers[0]).toBe(loser)
  })

  it('changes nothing for a tie far below the cash line (SQ-3)', () => {
    const top = [140, 139, 138, 137, 136, 135, 134, 133, 132].map(flat)
    const bowlers = [...top, bowler([30, 31, 33]), bowler([31, 31, 32]), ...tail(29)]

    const result = work(bowlers)

    expect(ids(result.advancers)).toEqual(ids(top.slice(0, 5)))
    expect(ids(result.cashers)).toEqual(ids(top.slice(5, 8)))
    expect(result.others).toHaveLength(32)
  })

  it('settles a tie for the last cash spot on high game (SQ-4)', () => {
    const top = [200, 199, 198, 197, 196, 195, 194].map(flat)
    const winner = bowler([44, 45, 46])
    const loser = bowler([45, 45, 45])
    const bowlers = [...top, winner, loser, ...tail(31)]

    const result = work(bowlers)

    expect(ids(result.cashers)).toEqual([...ids(top.slice(5, 7)), winner.bowlerId])
    expect(result.others[0]).toBe(loser)
  })
})

describe('workOutDivision: earlier advancers (RES-06 to RES-09, D-81)', () => {
  // Legacy GitHub issue 9. A to E advanced earlier. 40 entries, so 5 advance and 3 cash.
  function field(earlier: ResultEntry[]) {
    const rest = Array.from({ length: 35 }, (_, index) => flat(35 - index))
    return { earlier, rest, all: [...earlier, ...rest] }
  }
  const since = (entries: ResultEntry[]) => new Set(entries.map((entry) => entry.bowlerId))

  it('lets the top earlier advancer cash and the next two bowlers cash (SQ-10)', () => {
    const top = flat(300)
    const { earlier, rest, all } = field([top, flat(-1), flat(-2), flat(-3), flat(-4)])

    const result = work(all, { advancedBefore: since(earlier) })

    expect(ids(result.advancers)).toEqual(ids(rest.slice(0, 5)))
    expect(ids(result.cashers)).toEqual([top.bowlerId, ...ids(rest.slice(5, 7))])
    expect(result.others).toHaveLength(32)
  })

  it('lets three top earlier advancers cash and no one else (SQ-11)', () => {
    const top = [flat(300), flat(299), flat(298)]
    const earlier = [...top, flat(-1), flat(-2)]
    const { rest, all } = field(earlier)

    const result = work(all, { advancedBefore: since(earlier) })

    expect(ids(result.advancers)).toEqual(ids(rest.slice(0, 5)))
    expect(ids(result.cashers)).toEqual(ids(top))
    expect(result.others).toHaveLength(32)
  })

  it('lets five top earlier advancers cash, more than the 3 spots (SQ-12)', () => {
    const earlier = [300, 299, 298, 297, 296].map(flat)
    const { rest, all } = field(earlier)

    const result = work(all, { advancedBefore: since(earlier) })

    expect(ids(result.advancers)).toEqual(ids(rest.slice(0, 5)))
    expect(ids(result.cashers)).toEqual(ids(earlier))
    expect(result.cashSpots).toBe(3)
    expect(result.others).toHaveLength(30)
  })

  it('cashes an earlier advancer tied with the cut total even when ranked below others (SQ-13, SQ-26)', () => {
    const top = [200, 199, 198, 197].map(flat)
    const lastAdvancer = bowler([39, 35, 35]) // 109, high game 39
    const ordinary = bowler([38, 36, 35]) // 109, high game 38
    const earlier = bowler([37, 36, 36]) // 109, high game 37
    const rest = Array.from({ length: 33 }, (_, index) => flat(33 - index))

    const result = work([...top, lastAdvancer, ordinary, earlier, ...rest], {
      advancedBefore: since([earlier]),
      cashRatio: 8, // no spots beyond the advancers
    })

    expect(result.cashSpots).toBe(0)
    expect(ids(result.advancers)).toEqual(ids([...top, lastAdvancer]))
    expect(result.cashers).toEqual([earlier])
    expect(result.others[0]).toBe(ordinary)
  })

  it('lists an earlier advancer below the cut and outside the cash places with the others (SQ-14, SQ-25)', () => {
    const bowlers = Array.from({ length: 24 }, (_, index) => flat(24 - index))
    const last = bowlers.at(-1)
    if (!last) throw new Error('no bowlers')

    const result = work(bowlers, { cashRatio: 4.5, advancedBefore: since([last]) })

    expect(result.cashers).not.toContain(last)
    expect(result.others).toContain(last)
  })

  it('takes the one cash spot for an earlier advancer with the top score when no one advances (SQ-15)', () => {
    const top = flat(300)
    const bowlers = [top, flat(40), flat(39), flat(38), flat(37), flat(36)]

    const result = work(bowlers, { advancedBefore: since([top]) })

    expect(result.advancers).toEqual([])
    expect(result.cashers).toEqual([top])
    expect(result.others).toHaveLength(5)
  })

  it('cashes an earlier advancer scoring below the cut but inside the cash places (SQ-24)', () => {
    // 24 entries, finals 8, cash 4.5: 3 advance, 2 cash. Cut 715.
    const advancers = [bowler([247, 247, 247]), bowler([240, 241, 241]), bowler([238, 238, 239])]
    const ed = bowler([235, 235, 235]) // 705
    const ray = bowler([233, 234, 234]) // 701
    const paul = bowler([232, 233, 233]) // 698
    const rest = Array.from({ length: 18 }, (_, index) => flat(100 - index))

    const result = work([...advancers, ed, ray, paul, ...rest], {
      cashRatio: 4.5,
      advancedBefore: since([ed]),
    })

    expect(result.cutTotal).toBe(715)
    expect(result.cashers).toEqual([ed, ray])
    expect(result.others[0]).toBe(paul)
  })

  it('does not let an earlier advancer take an advancing spot', () => {
    const earlier = flat(300)
    const bowlers = [earlier, ...Array.from({ length: 15 }, (_, index) => flat(40 - index))]

    const result = work(bowlers, { advancedBefore: since([earlier]) })

    expect(result.advancers).not.toContain(earlier)
    expect(result.advancers).toHaveLength(2)
  })
})

describe('workOutDivision: too few bowlers (RES-08 defect)', () => {
  it('fills the spots it can from a complete squad with 6 no-shows (SQ-16, DN-5)', () => {
    const bowlers = [bowler([200, 200, 200]), bowler([190, 190, 190])]
    const noShows = Array.from({ length: 6 }, () => bowler([0, 0, 0]))

    const result = work([...bowlers, ...noShows], {
      complete: true,
      finalsRatio: 8,
      cashRatio: 2,
    })

    expect(result.advanceSpots).toBe(1)
    expect(result.cashSpots).toBe(3)
    expect(result.advancers).toEqual([bowlers[0]])
    expect(result.cashers).toEqual([bowlers[1]])
    expect(result.others).toEqual([])
  })

  it('works with an empty division', () => {
    const result = work([])

    expect(result.entryCount).toBe(0)
    expect(result.cashers).toEqual([])
  })
})

describe('workOutDivision: did not finish and no show (D-75)', () => {
  it('lists a bowler with fewer games apart, and never lets them advance or cash (DN-1)', () => {
    const full = bowler([200, 200, 200])
    const short = Array.from({ length: 9 }, (_, index) => bowler([250 - index, 250 - index]))

    const result = work([full, ...short], {
      complete: true,
      finalsRatio: 10,
      cashRatio: 2.5,
    })

    expect(result.advancers).toEqual([full])
    expect(result.cashers).toEqual([])
    expect(result.others).toEqual([])
    expect(result.didNotFinish).toHaveLength(9)
  })

  it('lists a bowler whose scores are all 0 as a no show (DN-2)', () => {
    const present = flat(200)
    const absent = bowler([0, 0, 0])

    const result = work([present, absent], { complete: true })

    expect(result.noShows).toEqual([absent])
    expect(result.didNotFinish).toEqual([])
    expect([...result.advancers, ...result.cashers, ...result.others]).toEqual([present])
  })

  it('ranks a bowler with fewer games below those with more on an open squad, with no sections (DN-3)', () => {
    const full = flat(150)
    const short = bowler([300, 300])

    const result = work([short, full], { complete: false })

    expect(result.didNotFinish).toEqual([])
    expect(result.noShows).toEqual([])
    expect([...result.advancers, ...result.cashers, ...result.others]).toEqual([full, short])
  })

  it('counts both kinds as entries, so the spots do not change (DN-4, SQ-19)', () => {
    const present = Array.from({ length: 14 }, (_, index) => flat(100 - index))
    const absent = bowler([0, 0, 0])
    const quit = bowler([200, 200])

    const result = work([...present, absent, quit], { complete: true })

    expect(result.entryCount).toBe(16)
    expect(result.advanceSpots).toBe(2)
    expect(result.advancers).toHaveLength(2)
  })

  it('leaves a division of bowlers who all did not finish with no ranked list (DN-6)', () => {
    const bowlers = [bowler([200, 200]), bowler([190, 190]), bowler([180])]

    const result = work(bowlers, { complete: true })

    expect(result.advancers).toEqual([])
    expect(result.cashers).toEqual([])
    expect(result.others).toEqual([])
    expect(result.didNotFinish).toHaveLength(3)
  })

  it('orders the did not finish list by SCR-11', () => {
    const better = bowler([200, 200])
    const worse = bowler([100, 100])
    const fewer = bowler([300])

    const result = work([fewer, worse, better], { complete: true })

    expect(result.didNotFinish).toEqual([better, worse, fewer])
  })

  it('does not call a bowler with one real score and zeros a no show', () => {
    const odd = bowler([0, 150, 0])

    const result = work([odd], { complete: true })

    expect(result.noShows).toEqual([])
  })
})
