import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createResultEntry } from '../../test/factories.ts'
import type { ResultEntry } from './entries.ts'
import { workOutDivision, type DivisionInput } from './squadResults.ts'
import { markCutLine, markTies, type Tie } from './ties.ts'

const flat = (score: number) => createResultEntry({ games: [score, score, score] })
const bowler = (games: number[]) => createResultEntry({ games })
const tail = (from: number) => Array.from({ length: from }, (_, index) => flat(from - index))
const top = (...scores: number[]) => scores.map(flat)

function marks(entries: ResultEntry[], over: Partial<DivisionInput> = {}) {
  const input: DivisionInput = {
    entries: faker.helpers.shuffle(entries),
    advancedBefore: new Set(),
    finalsRatio: 8,
    cashRatio: 5,
    games: 3,
    complete: false,
    ...over,
  }
  const outcome = workOutDivision(input)
  return { outcome, marks: markTies(outcome, input.advancedBefore) }
}

const cut = (outcome: Tie['outcome'], decidedBy: Tie['decidedBy']): Tie => ({
  line: 'cut',
  outcome,
  decidedBy,
})
const cash = (outcome: Tie['outcome'], decidedBy: Tie['decidedBy']): Tie => ({
  line: 'cash',
  outcome,
  decidedBy,
})
const highGame = { kind: 'game', rank: 1 } as const

describe('markTies at the cut line (D-14, D-16)', () => {
  it('marks both sides of a tie settled on high game, and keeps 5 advancers (TI-1, TI-10)', () => {
    const winner = bowler([35, 36, 38])
    const loser = bowler([36, 36, 37])

    const { outcome, marks: found } = marks([
      ...top(140, 139, 138, 137),
      winner,
      loser,
      ...tail(34),
    ])

    expect(outcome.advancers).toHaveLength(5)
    expect(found.get(winner.registrationId)).toEqual([cut('won', highGame)])
    expect(found.get(loser.registrationId)).toEqual([cut('lost', highGame)])
    expect(found.size).toBe(2)
  })

  it('names the 2nd-highest game when the high games are equal (TI-2)', () => {
    const winner = bowler([38, 37, 34]) // 109
    const loser = bowler([38, 36, 35]) // 109

    const { marks: found } = marks([...top(140, 139, 138, 137), winner, loser, ...tail(34)])

    expect(found.get(winner.registrationId)).toEqual([cut('won', { kind: 'game', rank: 2 })])
    expect(found.get(loser.registrationId)).toEqual([cut('lost', { kind: 'game', rank: 2 })])
  })

  it('names the games bowled when the totals are equal and the counts differ (TI-3)', () => {
    const winner = bowler([30, 35, 35]) // 100, 3 games
    const loser = bowler([50, 50]) // 100, 2 games

    const { marks: found } = marks([
      ...top(140, 139, 138, 137),
      winner,
      loser,
      ...tail(33),
      flat(0),
    ])

    expect(found.get(winner.registrationId)).toEqual([cut('won', { kind: 'games' })])
    expect(found.get(loser.registrationId)).toEqual([cut('lost', { kind: 'games' })])
  })

  it('flags a full tie on both sides and names no tie-breaker (TI-4)', () => {
    const first = bowler([35, 36, 38])
    const second = bowler([38, 35, 36])

    const { marks: found } = marks([...top(140, 139, 138, 137), first, second, ...tail(34)])

    const tied = [first, second].map((entry) => found.get(entry.registrationId))
    expect(tied).toContainEqual([cut('full', null)])
    expect(tied.filter(Boolean)).toHaveLength(2)
    expect(tied.every((tie) => tie?.[0]?.decidedBy === null)).toBe(true)
  })

  it('marks the advancer and both bowlers below in a three-way tie for one spot (TI-6)', () => {
    const one = bowler([35, 36, 38])
    const two = bowler([36, 36, 37])
    const three = bowler([37, 36, 36])

    const { outcome, marks: found } = marks([
      ...top(140, 139, 138, 137),
      one,
      two,
      three,
      ...tail(33),
    ])

    expect(outcome.advancers).toHaveLength(5)
    expect(found.get(one.registrationId)).toEqual([cut('won', highGame)])
    expect(found.get(two.registrationId)).toEqual([cut('lost', highGame)])
    expect(found.get(three.registrationId)).toEqual([cut('lost', highGame)])
  })

  it('marks every advancer who shares the last total (a tie of two above and one below)', () => {
    const one = bowler([40, 35, 34]) // 109
    const two = bowler([39, 35, 35]) // 109
    const three = bowler([38, 36, 35]) // 109

    const { outcome, marks: found } = marks([...top(140, 139, 138), one, two, three, ...tail(34)])

    expect(outcome.advancers).toEqual(expect.arrayContaining([one, two]))
    expect(found.get(one.registrationId)).toEqual([cut('won', highGame)])
    expect(found.get(two.registrationId)).toEqual([cut('won', highGame)])
    expect(found.get(three.registrationId)).toEqual([cut('lost', highGame)])
  })

  it('marks nothing when the totals differ across the line (TI-7)', () => {
    const { marks: found } = marks(Array.from({ length: 40 }, (_, index) => flat(40 - index)))

    expect(found.size).toBe(0)
  })

  it('does not count an earlier advancer as a competitor at the cut (TI-8)', () => {
    const lastAdvancer = bowler([39, 35, 35]) // 109
    const earlier = bowler([37, 36, 36]) // 109
    const rest = Array.from({ length: 34 }, (_, index) => flat(34 - index))

    const { outcome, marks: found } = marks(
      [...top(200, 199, 198, 197), lastAdvancer, earlier, ...rest],
      { advancedBefore: new Set([earlier.bowlerId]), cashRatio: 8 },
    )

    expect(outcome.cashers).toEqual([earlier])
    expect(found.size).toBe(0)
  })

  it('does not mark the cash line when an earlier advancer cashes below an ordinary bowler with the same total', () => {
    const lastAdvancer = bowler([39, 35, 35]) // 109
    const ordinary = bowler([38, 36, 35]) // 109
    const earlier = bowler([37, 36, 36]) // 109
    const rest = Array.from({ length: 33 }, (_, index) => flat(33 - index))

    const { marks: found } = marks(
      [...top(200, 199, 198, 197), lastAdvancer, ordinary, earlier, ...rest],
      { advancedBefore: new Set([earlier.bowlerId]), cashRatio: 8 },
    )

    expect(found.get(earlier.registrationId)).toBeUndefined()
    expect(found.get(lastAdvancer.registrationId)).toEqual([cut('won', highGame)])
    expect(found.get(ordinary.registrationId)).toEqual([cut('lost', highGame)])
  })
})

describe('markTies at the cash line (TI-5)', () => {
  it('marks a tie across the cash line on high game', () => {
    const winner = bowler([44, 45, 46]) // 135
    const loser = bowler([45, 45, 45]) // 135

    const { outcome, marks: found } = marks([
      ...top(200, 199, 198, 197, 196, 195, 194),
      winner,
      loser,
      ...tail(31),
    ])

    expect(outcome.cashers).toHaveLength(3)
    expect(found.get(winner.registrationId)).toEqual([cash('won', highGame)])
    expect(found.get(loser.registrationId)).toEqual([cash('lost', highGame)])
  })

  it('marks a bowler on both lines when one tie spans both (A = 1, C = 1)', () => {
    // 12 entries, finals 8, cash 5: 1 advances and 1 cashes.
    const one = bowler([35, 36, 38]) // 109, high game 38
    const two = bowler([37, 37, 35]) // 109, 2nd game 37
    const three = bowler([36, 36, 37]) // 109, 2nd game 36
    const second = { kind: 'game', rank: 2 } as const

    const { marks: found } = marks([one, two, three, ...tail(9)])

    expect(found.get(one.registrationId)).toEqual([cut('won', highGame)])
    expect(found.get(two.registrationId)).toEqual([cut('lost', highGame), cash('won', second)])
    expect(found.get(three.registrationId)).toEqual([cut('lost', highGame), cash('lost', second)])
  })
})

describe('markTies elsewhere', () => {
  it('marks nothing for a tie that crosses no line (TI-9)', () => {
    const top9 = top(140, 139, 138, 137, 136, 135, 134, 133, 132)

    const { marks: found } = marks([
      ...top9,
      bowler([30, 31, 33]),
      bowler([31, 31, 32]),
      ...tail(29),
    ])

    expect(found.size).toBe(0)
  })

  it('marks nothing when no one advances and no one ties for the one cash spot', () => {
    const { marks: found } = marks([flat(40), flat(39), flat(38)])

    expect(found.size).toBe(0)
  })

  it('marks a tie for the one cash spot when no one advances', () => {
    const winner = bowler([35, 36, 38])
    const loser = bowler([36, 36, 37])

    const { outcome, marks: found } = marks([winner, loser, flat(10)])

    expect(outcome.advancers).toEqual([])
    expect(found.get(winner.registrationId)).toEqual([cash('won', highGame)])
    expect(found.get(loser.registrationId)).toEqual([cash('lost', highGame)])
  })

  it('never marks a bowler listed apart on a complete squad (D-75)', () => {
    const present = flat(200)
    const quit = bowler([200, 200])
    const absent = bowler([0, 0, 0])

    const { marks: found } = marks([present, quit, absent], { complete: true })

    expect(found.get(quit.registrationId)).toBeUndefined()
    expect(found.get(absent.registrationId)).toBeUndefined()
  })
})

describe('markCutLine (D-93)', () => {
  it('marks a tie across the line with the deciding tie-breaker (AL-11)', () => {
    const winner = bowler([35, 36, 38])
    const loser = bowler([36, 36, 37])
    const clear = bowler([10, 10, 10])

    const found = markCutLine([flat(200), winner], [loser, clear])

    expect(found.get(winner.registrationId)).toEqual([cut('won', highGame)])
    expect(found.get(loser.registrationId)).toEqual([cut('lost', highGame)])
    expect(found.size).toBe(2)
  })

  it('marks nothing when the totals differ across the line', () => {
    expect(markCutLine([flat(200)], [flat(150)]).size).toBe(0)
  })

  it('marks nothing when there is nobody above the line', () => {
    expect(markCutLine([], [flat(150)]).size).toBe(0)
  })

  it('marks a full tie on both sides, for the director to settle (D-16)', () => {
    const a = flat(200)
    const b = flat(200)

    const found = markCutLine([a], [b])

    expect(found.get(a.registrationId)).toEqual([cut('full', null)])
    expect(found.get(b.registrationId)).toEqual([cut('full', null)])
  })
})
