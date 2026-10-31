import { describe, expect, it } from 'vitest'
import { createDivision, createLaneEntry, createSquad } from '../../test/factories.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import type { LaneEntry } from '../lanes/types.ts'
import { createInMemoryScoreRepository } from '../scores/repository.ts'
import type { Squad } from '../squads/types.ts'
import { workOutSquads } from './squadFlow.ts'

const open = createDivision({ number: 1, name: 'Open' })

interface Seat {
  squad: Squad
  entry: LaneEntry
  total: number
}

function depsFor(seats: Seat[]) {
  return {
    lanes: createInMemoryLaneRepository(
      seats.map(({ squad, entry }) => ({ sessionId: squad.id, entry })),
    ),
    scores: createInMemoryScoreRepository(
      seats.flatMap(({ squad, entry, total }) =>
        [1, 2, 3].map((game) => ({
          sessionId: squad.id,
          score: { bowlerId: entry.bowlerId, game, score: total / 3 },
        })),
      ),
    ),
  }
}

/** One in six advances, so the best of six does. */
const squadAt = (date: string) =>
  createSquad({ date, finalsRatio: 6, cashRatio: 100, games: 3, complete: true })

const bowler = (over: Partial<LaneEntry> = {}) =>
  createLaneEntry({ divisionId: open.id, average: null, ...over })

function sixSeats(squad: Squad, totals = [750, 700, 690, 600, 590, 580]): Seat[] {
  return totals.map((total) => ({ squad, entry: bowler(), total }))
}

describe('workOutSquads', () => {
  it('returns nothing for no squads', async () => {
    expect(await workOutSquads(depsFor([]), [], [open])).toEqual([])
  })

  it('works out each division of a squad', async () => {
    const squad = squadAt('2026-10-24T09:00:00')
    const seats = sixSeats(squad)

    const [worked] = await workOutSquads(depsFor(seats), [squad], [open])

    expect(worked?.squad).toBe(squad)
    expect(worked?.outcomes.map((o) => o.divisionId)).toEqual([open.id])
    expect(worked?.outcomes[0]?.outcome.advancers.map((a) => a.bowlerId)).toEqual([
      seats[0]?.entry.bowlerId,
    ])
    expect(worked?.skipped).toEqual([])
  })

  it('passes the advancers of an earlier squad to the next (RES-06)', async () => {
    const morning = squadAt('2026-10-24T09:00:00')
    const noon = squadAt('2026-10-24T13:00:00')
    const morningSeats = sixSeats(morning)
    const worked = await workOutSquads(
      depsFor([...morningSeats, ...sixSeats(noon)]),
      [morning, noon],
      [open],
    )

    const first = worked[0]
    const second = worked[1]
    expect([...(first?.advancedBefore ?? [])]).toEqual([])
    expect([...(second?.advancedBefore ?? [])]).toEqual([morningSeats[0]?.entry.bowlerId])
  })

  it('gives each squad its own copy of the earlier advancers', async () => {
    const morning = squadAt('2026-10-24T09:00:00')
    const noon = squadAt('2026-10-24T13:00:00')
    const worked = await workOutSquads(
      depsFor([...sixSeats(morning), ...sixSeats(noon)]),
      [morning, noon],
      [open],
    )

    // The first squad's set must not pick up the advancers found after it.
    expect(worked[0]?.advancedBefore.size).toBe(0)
  })

  it('lists registrations whose division is not in the tournament as skipped (D-51)', async () => {
    const squad = squadAt('2026-10-24T09:00:00')
    const stray = { squad, entry: bowler({ divisionId: 'gone' }), total: 600 }

    const [worked] = await workOutSquads(depsFor([...sixSeats(squad), stray]), [squad], [open])

    expect(worked?.skipped).toEqual([stray.entry.registrationId])
  })
})
