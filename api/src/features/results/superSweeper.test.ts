import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createDivision, createLaneEntry, createSweeper } from '../../test/factories.ts'
import type { LaneEntry } from '../lanes/types.ts'
import type { Sweeper } from '../sweepers/types.ts'
import { buildSuperSweeperEntries, workOutSuperSweeper, type SweeperInput } from './superSweeper.ts'

const open = createDivision({ number: 1, name: 'Open' })
const women = createDivision({ number: 2, name: 'Women' })

const pinsFor = (division: { id: string; name: string }, bonusPinsPerGame: number) => ({
  divisionId: division.id,
  divisionName: division.name,
  bonusPinsPerGame,
})

const registrant = (over: Partial<LaneEntry> = {}) =>
  createLaneEntry({ superSweeper: true, divisionId: open.id, ...over })

/** A sweeper with the given entries, each bowling `scores`. */
function sweeperOf(
  sweeper: Partial<Sweeper>,
  seats: { entry: LaneEntry; scores: number[] }[],
): SweeperInput {
  const made = createSweeper({ games: 3, complete: true, ...sweeper })
  return {
    sweeper: made,
    entries: seats.map((seat) => seat.entry),
    scores: seats.flatMap(({ entry, scores }) =>
      scores.map((score, index) => ({ bowlerId: entry.bowlerId, game: index + 1, score })),
    ),
  }
}

describe('buildSuperSweeperEntries', () => {
  it('joins the games of every sweeper into one entry and sums the totals (RES-27, SS-1)', () => {
    const bowler = registrant()
    const inputs = [
      sweeperOf({}, [{ entry: bowler, scores: [200, 210, 190] }]),
      sweeperOf({}, [{ entry: bowler, scores: [220, 180, 200] }]),
    ]

    const { entries } = buildSuperSweeperEntries(inputs, [open])

    expect(entries).toHaveLength(1)
    expect(entries[0]?.entry).toMatchObject({ total: 1200, highGame: 220 })
    expect(entries[0]?.entry.games).toHaveLength(6)
    expect(entries[0]?.sweeperTotals).toEqual([600, 600])
    expect(entries[0]?.flags).toEqual([])
  })

  it('leaves out a bowler who is not in the super sweeper (SS-6, RES-26)', () => {
    const plain = createLaneEntry({ superSweeper: false, divisionId: open.id })
    const inputs = [sweeperOf({}, [{ entry: plain, scores: [300, 300, 300] }])]

    expect(buildSuperSweeperEntries(inputs, [open]).entries).toEqual([])
  })

  it('gives each game its own sweeper’s bonus pins (SS-7, RES-27 defect)', () => {
    const bowler = registrant({ divisionId: women.id })
    const first = sweeperOf({ bonusPins: [pinsFor(women, 10)] }, [
      { entry: bowler, scores: [200, 200, 200] },
    ])
    const second = sweeperOf({ bonusPins: [pinsFor(women, 4)] }, [
      { entry: bowler, scores: [200, 200, 200] },
    ])

    const { entries } = buildSuperSweeperEntries([first, second], [women])

    expect(entries[0]?.sweeperTotals).toEqual([630, 612])
    expect(entries[0]?.entry.total).toBe(1242)
    // The high game uses the pins of the sweeper it was bowled in.
    expect(entries[0]?.entry.highGame).toBe(210)
  })

  it('counts a division with no bonus row as 0 pins (SCR-09)', () => {
    const bowler = registrant()
    const inputs = [sweeperOf({}, [{ entry: bowler, scores: [100, 100, 100] }])]

    expect(buildSuperSweeperEntries(inputs, [open]).entries[0]?.entry.total).toBe(300)
  })

  it('scores zero for a complete sweeper the bowler missed, with no pins, and flags it (SS-8, D-90)', () => {
    const bowler = registrant()
    const other = registrant()
    const pins = [pinsFor(open, 10)]
    const bowled = sweeperOf({ bonusPins: pins }, [
      { entry: bowler, scores: [200, 200, 200] },
      { entry: other, scores: [100, 100, 100] },
    ])
    const missed = sweeperOf({ bonusPins: pins }, [{ entry: other, scores: [100, 100, 100] }])
    // The bowler is entered in the missed sweeper but did not bowl.
    missed.entries = [...missed.entries, bowler]

    const { entries } = buildSuperSweeperEntries([bowled, missed], [open])

    const mine = entries.find((item) => item.entry.registrationId === bowler.registrationId)
    expect(mine?.sweeperTotals).toEqual([630, 0])
    expect(mine?.entry.total).toBe(630)
    expect(mine?.entry.games).toHaveLength(6)
    expect(mine?.flags).toEqual([{ kind: 'missed', sweeperId: missed.sweeper.id, gamesBowled: 0 }])
  })

  it('flags a bowler not entered in a complete sweeper as missed (REG-06 data gap)', () => {
    const bowler = registrant()
    const elsewhere = registrant()
    const bowled = sweeperOf({}, [{ entry: bowler, scores: [200, 200, 200] }])
    const absent = sweeperOf({}, [{ entry: elsewhere, scores: [150, 150, 150] }])

    const { entries } = buildSuperSweeperEntries([bowled, absent], [open])

    const mine = entries.find((item) => item.entry.registrationId === bowler.registrationId)
    expect(mine?.flags).toEqual([{ kind: 'missed', sweeperId: absent.sweeper.id, gamesBowled: 0 }])
  })

  it('zero-fills the missing games of an unfinished complete sweeper and flags it (D-90)', () => {
    const bowler = registrant()
    const pins = [pinsFor(open, 6)]
    const input = sweeperOf({ bonusPins: pins }, [{ entry: bowler, scores: [200, 190] }])

    const { entries } = buildSuperSweeperEntries([input], [open])

    // Two games bowled earn pins; the missing third earns none.
    expect(entries[0]?.sweeperTotals).toEqual([402])
    expect(entries[0]?.entry.games).toEqual([200, 190, 0])
    expect(entries[0]?.flags).toEqual([
      { kind: 'unfinished', sweeperId: input.sweeper.id, gamesBowled: 2 },
    ])
  })

  it('adds no zeros for a sweeper that is still open, and shows no total (D-90)', () => {
    const bowler = registrant()
    const done = sweeperOf({}, [{ entry: bowler, scores: [200, 200, 200] }])
    const running = sweeperOf({ complete: false }, [{ entry: bowler, scores: [] }])

    const { entries } = buildSuperSweeperEntries([done, running], [open])

    expect(entries[0]?.sweeperTotals).toEqual([600, null])
    expect(entries[0]?.entry.games).toHaveLength(3)
    expect(entries[0]?.flags).toEqual([])
  })

  it('keeps a partly bowled open sweeper as bowled so far, with no flag', () => {
    const bowler = registrant()
    const running = sweeperOf({ complete: false }, [{ entry: bowler, scores: [200] }])

    const { entries } = buildSuperSweeperEntries([running], [open])

    expect(entries[0]?.sweeperTotals).toEqual([200])
    expect(entries[0]?.flags).toEqual([])
  })

  it('leaves out a bowler with no game at all while every sweeper is open', () => {
    const bowler = registrant()
    const running = sweeperOf({ complete: false }, [{ entry: bowler, scores: [] }])

    expect(buildSuperSweeperEntries([running], [open]).entries).toEqual([])
  })

  it('lists a bowler who missed every complete sweeper, with zeros', () => {
    const bowler = registrant()
    const input = sweeperOf({}, [{ entry: bowler, scores: [] }])

    const { entries } = buildSuperSweeperEntries([input], [open])

    expect(entries[0]?.entry).toMatchObject({ total: 0, highGame: 0 })
    expect(entries[0]?.entry.games).toEqual([0, 0, 0])
    expect(entries[0]?.flags[0]?.kind).toBe('missed')
  })

  it('counts every game, so a bowler with 6 games ranks above one with 3 (SS-9)', () => {
    const full = registrant()
    const partial = registrant()
    const a = sweeperOf({}, [
      { entry: full, scores: [100, 100, 100] },
      { entry: partial, scores: [250, 250, 250] },
    ])
    const b = sweeperOf({}, [{ entry: full, scores: [100, 100, 100] }])
    b.entries = [...b.entries, partial]
    const { entries } = buildSuperSweeperEntries([a, b], [open])

    const outcome = workOutSuperSweeper(entries, 100)

    // Both have 6 games (the missed sweeper is zero-filled), so the total decides.
    expect(outcome.cashers[0]?.entry.registrationId).toBe(partial.registrationId)
  })

  it('skips a registrant whose division is not the tournament’s (D-51)', () => {
    const stray = registrant({ divisionId: faker.string.uuid() })
    const inputs = [sweeperOf({}, [{ entry: stray, scores: [200, 200, 200] }])]

    const built = buildSuperSweeperEntries(inputs, [open])

    expect(built.entries).toEqual([])
    expect(built.skipped).toEqual([stray.registrationId])
  })

  it('reads the registrant from the first sweeper they are entered in', () => {
    const bowler = registrant()
    const inputs = [
      sweeperOf({}, [{ entry: bowler, scores: [200, 200, 200] }]),
      sweeperOf({}, [{ entry: bowler, scores: [200, 200, 200] }]),
    ]

    expect(buildSuperSweeperEntries(inputs, [open]).entries).toHaveLength(1)
  })
})

describe('workOutSuperSweeper', () => {
  function field(totals: number[]) {
    const entries = totals.map((total) => {
      const bowler = registrant()
      const input = sweeperOf({ games: 1 }, [{ entry: bowler, scores: [total] }])
      return buildSuperSweeperEntries([input], [open]).entries[0]
    })
    return entries.flatMap((entry) => (entry ? [entry] : []))
  }

  it('cashes the top N / ratio and sets the cut score (SS-4, RES-28)', () => {
    const outcome = workOutSuperSweeper(field([201, 203, 205, 207]), 2)

    expect(outcome.entryCount).toBe(4)
    expect(outcome.cashCount).toBe(2)
    expect(outcome.cashers.map((item) => item.entry.total)).toEqual([207, 205])
    expect(outcome.others.map((item) => item.entry.total)).toEqual([203, 201])
    expect(outcome.cutScore).toBe(205)
  })

  it('cashes at least one when the ratio is large (SS-5)', () => {
    const outcome = workOutSuperSweeper(field([201, 203, 205, 207]), 500)

    expect(outcome.cashCount).toBe(1)
    expect(outcome.cutScore).toBe(207)
  })

  it('cashes everyone with a ratio of 1 (SS-11)', () => {
    const outcome = workOutSuperSweeper(field([100, 110, 120]), 1)

    expect(outcome.cashCount).toBe(3)
    expect(outcome.others).toEqual([])
  })

  it('rounds the cashers down (10 entries, ratio 4 then 3)', () => {
    const tenth = field([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    expect(workOutSuperSweeper(tenth, 4).cashCount).toBe(2)
    expect(workOutSuperSweeper(tenth, 3).cashCount).toBe(3)
  })

  it('has no cashers and no cut score with no entries', () => {
    expect(workOutSuperSweeper([], 5)).toMatchObject({
      entryCount: 0,
      cashCount: 0,
      cutScore: null,
    })
  })
})
