import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createResultEntry } from '../../test/factories.ts'
import type { ResultEntry } from './entries.ts'
import { workOutAtLarge, workOutSeeding, type SquadRun } from './finals.ts'
import type { DivisionOutcome } from './squadResults.ts'

const bowler = (score: number, over: Partial<Parameters<typeof createResultEntry>[0]> = {}) =>
  createResultEntry({ games: [score], ...over })

function outcome(parts: Partial<DivisionOutcome>): DivisionOutcome {
  const advancers = parts.advancers ?? []
  const cashers = parts.cashers ?? []
  const others = parts.others ?? []
  return {
    entryCount: advancers.length + cashers.length + others.length,
    advanceSpots: advancers.length,
    cashSpots: cashers.length,
    cutTotal: advancers.at(-1)?.total,
    advancers,
    cashers,
    others,
    didNotFinish: [],
    noShows: [],
    ...parts,
  }
}

let clock = 0
function run(parts: Partial<DivisionOutcome>): SquadRun {
  clock += 1
  return {
    squadId: faker.string.uuid(),
    squadDate: `2026-10-2${clock % 10}T09:00:00`,
    outcome: outcome(parts),
  }
}

const scores = (...values: number[]) => values.map((score) => bowler(score))
const names = (placed: { entry: ResultEntry }[]) => placed.map((item) => item.entry.total)

describe('workOutAtLarge', () => {
  it('has no at-large spots when the total spots are fewer than the squad advancers (AL-1, RES-13)', () => {
    // Ratio 2: 3 advancers and 1 casher make 4 entries, S = 2, Q = 3.
    const result = workOutAtLarge(
      [run({ advancers: scores(250, 249, 248), cashers: scores(200) })],
      2,
    )

    expect(result.totalSpots).toBe(2)
    expect(result.atLargeSpots).toBe(0)
    expect(result.advancers).toEqual([])
  })

  it('has no at-large spots when the total spots equal the squad advancers (AL-2, RES-13)', () => {
    const result = workOutAtLarge(
      [run({ advancers: scores(250, 249), cashers: scores(200, 199) })],
      2,
    )

    expect(result.totalSpots).toBe(2)
    expect(result.atLargeSpots).toBe(0)
    expect(result.advancers).toEqual([])
  })

  it('takes the top of the pool for the open spots (AL-3, RES-15)', () => {
    const result = workOutAtLarge(
      [run({ advancers: scores(250, 249), others: scores(200, 199, 198, 197) })],
      2,
    )

    expect(result.entryCount).toBe(6)
    expect(result.totalSpots).toBe(3)
    expect(result.atLargeSpots).toBe(1)
    expect(names(result.advancers)).toEqual([200])
    expect(names(result.others)).toEqual([199, 198, 197])
    expect(result.previousCashers.size).toBe(0)
  })

  it('flags an at-large advancer who cashed in a squad (AL-4, RES-16, D-07)', () => {
    const casher = bowler(200)
    const result = workOutAtLarge(
      [run({ advancers: scores(250, 249), cashers: [casher], others: scores(199, 198, 197) })],
      2,
    )

    expect(result.advancers.map((item) => item.entry)).toEqual([casher])
    expect(result.previousCashers.has(casher.bowlerId)).toBe(true)
  })

  it('sums the entries of three squads: 80 entries, ratio 8, 8 advancers, 2 at-large (AL-7, RES-12)', () => {
    const a = run({ entryCount: 30, advancers: scores(900, 899, 898), others: scores(500, 400) })
    const b = run({ entryCount: 27, advancers: scores(890, 889, 888), others: scores(450) })
    const c = run({ entryCount: 23, advancers: scores(880, 879), others: scores(480, 300) })

    const result = workOutAtLarge([a, b, c], 8)

    expect(result.entryCount).toBe(80)
    expect(result.totalSpots).toBe(10)
    expect(result.squadAdvancers).toBe(8)
    expect(result.atLargeSpots).toBe(2)
    expect(names(result.advancers)).toEqual([500, 480])
  })

  it('leaves out anyone who advanced in any squad (AL-8, RES-14)', () => {
    const star = bowler(300)
    const earlier = run({ advancers: [star], others: scores(100) })
    // The same bowler bowls again in a later squad and does not advance there.
    const later = run({
      advancers: scores(280),
      others: [bowler(290, { bowlerId: star.bowlerId })],
    })

    const result = workOutAtLarge([earlier, later], 1)

    const pool = [...result.advancers, ...result.others].map((item) => item.entry.bowlerId)
    expect(pool).not.toContain(star.bowlerId)
  })

  it('lists a bowler once, with the best squad, and the earliest on a tie (AL-9, RES-14)', () => {
    const same = { bowlerId: faker.string.uuid() }
    const first = run({ others: [bowler(180, same), ...scores(10)] })
    const second = run({ others: [bowler(210, same), ...scores(10)] })
    const third = run({ others: [bowler(210, same), ...scores(10)] })

    const result = workOutAtLarge([first, second, third], 1)

    const found = [...result.advancers, ...result.others].filter(
      (item) => item.entry.bowlerId === same.bowlerId,
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.entry.total).toBe(210)
    expect(found[0]?.squadId).toBe(second.squadId)
    expect(found[0]?.squadDate).toBe(second.squadDate)
  })

  it('keeps a bowler who did not finish or did not show out of the pool, but counts the entry (D-91)', () => {
    const quit = bowler(150)
    const absent = bowler(0)
    const squad = run({
      entryCount: 6,
      advancers: scores(250),
      others: scores(100, 90),
      didNotFinish: [quit],
      noShows: [absent],
    })

    const result = workOutAtLarge([squad], 2)

    expect(result.entryCount).toBe(6)
    expect(result.atLargeSpots).toBe(2)
    const pool = [...result.advancers, ...result.others].map((item) => item.entry)
    expect(pool).not.toContain(quit)
    expect(pool).not.toContain(absent)
  })

  it('works out each division alone from its own runs (AL-12)', () => {
    const one = workOutAtLarge([run({ advancers: scores(250), others: scores(100, 90, 80) })], 2)
    const two = workOutAtLarge([run({ advancers: scores(300), others: scores(50) })], 4)

    expect(one.atLargeSpots).toBe(1)
    expect(two.atLargeSpots).toBe(0)
  })

  it('gives no spots and no crash for a division with no entries', () => {
    const result = workOutAtLarge([run({})], 8)

    expect(result).toMatchObject({ entryCount: 0, totalSpots: 0, atLargeSpots: 0 })
  })
})

describe('workOutSeeding', () => {
  it('seeds squad advancers and the at-large advancer, then the rest in order (SD-1, RES-20)', () => {
    const squad = run({
      advancers: scores(297, 299),
      others: scores(250, 198, 197, 167, 150),
    })
    const atLarge = workOutAtLarge([squad], 2)

    const seeding = workOutSeeding([squad], atLarge)

    expect(atLarge.atLargeSpots).toBe(1)
    expect(names(seeding.finalists)).toEqual([299, 297, 250])
    expect(names(seeding.others)).toEqual([198, 197, 167, 150])
  })

  it('counts a re-entering bowler once, with the best entry (SD-2, RES-19)', () => {
    const same = { bowlerId: faker.string.uuid() }
    const first = run({ advancers: scores(299), others: [bowler(198, same), ...scores(150)] })
    const second = run({ others: [bowler(167, same), ...scores(197)] })
    const atLarge = workOutAtLarge([first, second], 4)

    const seeding = workOutSeeding([first, second], atLarge)

    const mine = [...seeding.finalists, ...seeding.others].filter(
      (item) => item.entry.bowlerId === same.bowlerId,
    )
    expect(mine).toHaveLength(1)
    expect(mine[0]?.entry.total).toBe(198)
    expect(names(seeding.others)).toEqual([198, 197, 150])
  })

  it('seeds a finalist on a later, better squad entry (SD-3, RES-19)', () => {
    const same = { bowlerId: faker.string.uuid() }
    const first = run({ advancers: [bowler(250, same)], others: scores(100) })
    const second = run({ others: [bowler(280, same), ...scores(120)] })
    const atLarge = workOutAtLarge([first, second], 4)

    const seeding = workOutSeeding([first, second], atLarge)

    expect(seeding.finalists[0]?.entry.total).toBe(280)
    expect(seeding.finalists[0]?.squadId).toBe(second.squadId)
  })

  it('ranks with the handicap in the total (SD-4)', () => {
    const lowScratch = createResultEntry({ games: [180, 180], pins: 20 }) // 400
    const highScratch = createResultEntry({ games: [195, 195], pins: 0 }) // 390
    const squad = run({ advancers: [highScratch, lowScratch] })
    const seeding = workOutSeeding([squad], workOutAtLarge([squad], 1))

    expect(seeding.finalists.map((item) => item.entry)).toEqual([lowScratch, highScratch])
  })

  it('flags only an at-large finalist who cashed (RES-21)', () => {
    const casher = bowler(200)
    const squad = run({
      advancers: scores(250, 249),
      cashers: [casher],
      others: scores(100, 90, 80),
    })
    const atLarge = workOutAtLarge([squad], 2)

    const seeding = workOutSeeding([squad], atLarge)

    expect(seeding.previousCashers.has(casher.bowlerId)).toBe(true)
    expect(seeding.previousCashers.size).toBe(1)
  })

  it('does not flag a squad advancer who cashed in an earlier squad (RES-21)', async () => {
    const same = { bowlerId: faker.string.uuid() }
    const earlier = run({
      advancers: scores(250),
      cashers: [bowler(200, same)],
      others: scores(10),
    })
    const later = run({ advancers: [bowler(260, same)], others: scores(20, 15) })
    const atLarge = workOutAtLarge([earlier, later], 4)

    const seeding = workOutSeeding([earlier, later], atLarge)

    expect(seeding.finalists.map((item) => item.entry.bowlerId)).toContain(same.bowlerId)
    expect(seeding.previousCashers.has(same.bowlerId)).toBe(false)
  })

  it('leaves out bowlers who did not finish or did not show (D-75)', () => {
    const quit = bowler(150)
    const squad = run({ advancers: scores(250), others: scores(100), didNotFinish: [quit] })

    const seeding = workOutSeeding([squad], workOutAtLarge([squad], 2))

    expect([...seeding.finalists, ...seeding.others].map((item) => item.entry)).not.toContain(quit)
  })
})
