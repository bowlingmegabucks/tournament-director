import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createResultEntry } from '../../test/factories.ts'
import type { ResultEntry } from './entries.ts'
import { workOutSweeper } from './sweeperResults.ts'
import { markCashLine } from './ties.ts'

const bowler = (games: number[], pins = 0) => createResultEntry({ games, pins })

/** The legacy sweeper tests: four bowlers, two games each. */
function legacyFour() {
  const bowlers = [bowler([201, 202]), bowler([203, 204]), bowler([205, 206]), bowler([207, 208])]
  return { bowlers, shuffled: faker.helpers.shuffle(bowlers) }
}

describe('workOutSweeper (RES-22 to RES-24)', () => {
  it('ranks the best total first and cashes 2 of 4 at ratio 2, with the cut at the last casher (SW-1, SW-11)', () => {
    const { bowlers, shuffled } = legacyFour()

    const result = workOutSweeper(shuffled, 2)

    expect([...result.cashers, ...result.others]).toEqual(bowlers.toReversed())
    expect(result.cashCount).toBe(2)
    expect(result.cashers).toHaveLength(2)
    expect(result.cutScore).toBe(411)
  })

  it('cashes at least one, even when the ratio is far above the entries (SW-2, D-08)', () => {
    const { bowlers, shuffled } = legacyFour()

    const result = workOutSweeper(shuffled, 500)

    expect(result.cashers).toEqual([bowlers[3]])
    expect(result.cutScore).toBe(415)
  })

  it('has no cashers and no cut score with no entries (SW-3)', () => {
    const result = workOutSweeper([], 4)

    expect(result).toEqual({ entryCount: 0, cashCount: 0, cashers: [], others: [], cutScore: null })
  })

  it('rounds the cash count down (SW-10)', () => {
    const ten = Array.from({ length: 10 }, (_, index) => bowler([200 - index]))

    expect(workOutSweeper(ten, 4).cashCount).toBe(2)
    expect(workOutSweeper(ten, 3).cashCount).toBe(3)
  })

  it('never cashes more bowlers than entered', () => {
    const two = [bowler([200]), bowler([190])]

    expect(workOutSweeper(two, 0.5).cashCount).toBe(2)
  })

  it('keeps everyone in one list whatever the division, ranked on totals with bonus pins (SW-6, SW-7)', () => {
    const open = createResultEntry({ games: [200, 200, 200], pins: 0, divisionName: 'Open' })
    const seniors = createResultEntry({
      games: [195, 195, 195],
      pins: 10,
      divisionName: 'Women/Senior',
    })

    const result = workOutSweeper([open, seniors], 2)

    expect(seniors.total).toBe(615)
    expect([...result.cashers, ...result.others]).toEqual([seniors, open])
  })

  it('ranks a bowler with fewer games below one with more (SW-8, DN-7)', () => {
    const full = bowler([150, 150, 150])
    const quit = bowler([300, 300])

    const result = workOutSweeper([quit, full], 2)

    expect([...result.cashers, ...result.others]).toEqual([full, quit])
  })
})

describe('sweeper cash line ties (SW-9, D-14)', () => {
  it('marks equal totals across the cash line, using the high game with bonus pins', () => {
    const winner = bowler([190, 195, 200], 5) // 585 + 15 = 600, high game 205
    const loser = bowler([196, 198, 191], 5) // 585 + 15 = 600, high game 203
    const entries: ResultEntry[] = [bowler([250, 250, 250]), winner, loser, bowler([100, 100, 100])]

    const result = workOutSweeper(entries, 2)
    const marks = markCashLine(result.cashers, result.others)

    expect(result.cashers).toHaveLength(2)
    expect(marks.get(winner.registrationId)).toEqual([
      { line: 'cash', outcome: 'won', decidedBy: { kind: 'game', rank: 1 } },
    ])
    expect(marks.get(loser.registrationId)).toEqual([
      { line: 'cash', outcome: 'lost', decidedBy: { kind: 'game', rank: 1 } },
    ])
  })

  it('marks nothing when the totals differ', () => {
    const result = workOutSweeper([bowler([250]), bowler([200]), bowler([150])], 3)

    expect(markCashLine(result.cashers, result.others).size).toBe(0)
  })

  it('marks nothing with no cashers', () => {
    expect(markCashLine([], [bowler([200])]).size).toBe(0)
  })
})
