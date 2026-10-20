import { describe, expect, it } from 'vitest'
import { createRandomTournamentRepository } from './randomRepository.ts'
import { tournamentSchema } from './types.ts'

const now = () => new Date('2026-06-01T12:00:00Z')
const lowest = (min: number) => min
const highest = (_min: number, max: number) => max - 1

describe('random tournament repository', () => {
  it('returns 3 tournaments when the dice roll lowest', async () => {
    const list = await createRandomTournamentRepository({ randomInt: lowest, now }).list()

    expect(list).toHaveLength(3)
  })

  it('returns 7 tournaments when the dice roll highest', async () => {
    const list = await createRandomTournamentRepository({ randomInt: highest, now }).list()

    expect(list).toHaveLength(7)
  })

  it('puts the date between tomorrow and a year out', async () => {
    const [soonest] = await createRandomTournamentRepository({ randomInt: lowest, now }).list()
    const [latest] = await createRandomTournamentRepository({ randomInt: highest, now }).list()

    expect(soonest?.date).toBe('2026-06-02')
    expect(latest?.date).toBe('2027-06-01')
  })

  it('keeps entrants between 8 and 128', async () => {
    const [few] = await createRandomTournamentRepository({ randomInt: lowest, now }).list()
    const [many] = await createRandomTournamentRepository({ randomInt: highest, now }).list()

    expect(few?.entrants).toBe(8)
    expect(many?.entrants).toBe(128)
  })

  it('sorts by date', async () => {
    let dateRolls = 0
    // Roll late and early dates in turn, so the sort has work to do. Other rolls take the lowest value.
    const alternateDates = (min: number, max: number) =>
      max === 366 ? (dateRolls++ % 2 === 0 ? max - 1 : min) : min + 2

    const list = await createRandomTournamentRepository({ randomInt: alternateDates, now }).list()
    const dates = list.map((tournament) => tournament.date)

    expect(dates).toHaveLength(5)
    expect(dates).toEqual([...dates].sort())
    expect(dates[0]).toBe('2026-06-02')
    expect(dates[4]).toBe('2027-06-01')
  })

  it('with real randomness: 3 to 7 valid tournaments with unique ids, new on each call', async () => {
    const repository = createRandomTournamentRepository()
    const lists = await Promise.all(Array.from({ length: 50 }, () => repository.list()))

    for (const list of lists) {
      expect(list.length).toBeGreaterThanOrEqual(3)
      expect(list.length).toBeLessThanOrEqual(7)
      expect(tournamentSchema.array().safeParse(list).success).toBe(true)
      expect(new Set(list.map((tournament) => tournament.id)).size).toBe(list.length)
    }
    expect(new Set(lists.flat().map((tournament) => tournament.id)).size).toBe(lists.flat().length)
  })
})
