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

describe('workOutSquads ranking modes (RES-40, RES-43, RES-55)', () => {
  /** An open four-game squad. Each bowler has the games listed; the rest are not bowled yet. */
  function depsWith(squad: Squad, bowlers: { entry: LaneEntry; games: number[] }[]) {
    return {
      lanes: createInMemoryLaneRepository(
        bowlers.map(({ entry }) => ({ sessionId: squad.id, entry })),
      ),
      scores: createInMemoryScoreRepository(
        bowlers.flatMap(({ entry, games }) =>
          games.map((score, index) => ({
            sessionId: squad.id,
            score: { bowlerId: entry.bowlerId, game: index + 1, score },
          })),
        ),
      ),
    }
  }

  const openSquad = (over: Partial<Squad> = {}) =>
    createSquad({
      date: '2026-10-24T09:00:00',
      finalsRatio: 100,
      cashRatio: 100,
      games: 4,
      ...over,
    })

  // Owner's example: after three games the leader is +150 (750). One bowler has bowled a fourth
  // game already and is +166 over four games (966).
  const leader = bowler()
  const quick = bowler()
  const others = [bowler(), bowler()]
  const seats = (squad: Squad) =>
    depsWith(squad, [
      { entry: leader, games: [250, 250, 250] },
      { entry: quick, games: [220, 220, 220, 300] },
      ...others.map((entry) => ({ entry, games: [200, 200, 200] })),
    ])
  const order = (worked: Awaited<ReturnType<typeof workOutSquads>>[number] | undefined) =>
    worked?.outcomes[0]?.outcome.advancers
      .concat(worked.outcomes[0].outcome.cashers, worked.outcomes[0].outcome.others)
      .map((e) => e.bowlerId)

  it('ranks the bowler with the fourth game below the leader in full-game mode (RES-40)', async () => {
    const squad = openSquad()
    const [worked] = await workOutSquads(seats(squad), [squad], [open], { mode: 'full-game' })

    expect(order(worked)?.[0]).toBe(leader.bowlerId)
    expect(worked?.outcomes[0]?.throughGame).toBe(3)
  })

  it('counts only the full games in the total of the bowler with a fourth game (RES-40)', async () => {
    const squad = openSquad()
    const [worked] = await workOutSquads(seats(squad), [squad], [open], { mode: 'full-game' })
    const all = worked?.outcomes[0]?.outcome
    const row = [...(all?.advancers ?? []), ...(all?.cashers ?? []), ...(all?.others ?? [])].find(
      (e) => e.bowlerId === quick.bowlerId,
    )

    expect(row?.total).toBe(660)
    expect(row?.gameScores).toEqual([220, 220, 220, 300])
  })

  it('ranks the bowler with the fourth game first in live mode (RES-40)', async () => {
    const squad = openSquad()
    const [worked] = await workOutSquads(seats(squad), [squad], [open], { mode: 'live' })

    expect(order(worked)?.[0]).toBe(quick.bowlerId)
    expect(worked?.outcomes[0]?.throughGame).toBeNull()
  })

  it('is live when no mode is given', async () => {
    const squad = openSquad()
    const [worked] = await workOutSquads(seats(squad), [squad], [open])
    expect(order(worked)?.[0]).toBe(quick.bowlerId)
  })

  it('counts every game of a complete squad in both modes (RES-43)', async () => {
    const squad = openSquad({ complete: true })
    const steady = await workOutSquads(seats(squad), [squad], [open], { mode: 'full-game' })
    const live = await workOutSquads(seats(squad), [squad], [open], { mode: 'live' })

    expect(order(steady[0])).toEqual(order(live[0]))
    expect(steady[0]?.outcomes[0]?.throughGame).toBe(4)
    expect(live[0]?.outcomes[0]?.throughGame).toBeNull()
  })

  it('does not wait for a flagged bowler (RES-55)', async () => {
    const squad = openSquad()
    const walked = bowler()
    const deps = depsWith(squad, [
      { entry: walked, games: [300, 300] },
      { entry: leader, games: [250, 250, 250] },
      { entry: quick, games: [220, 220, 220] },
    ])

    const waiting = await workOutSquads(deps, [squad], [open], { mode: 'full-game' })
    const flagged = await workOutSquads(deps, [squad], [open], {
      mode: 'full-game',
      flagged: new Map([[squad.id, new Set([walked.registrationId])]]),
    })

    expect(waiting[0]?.outcomes[0]?.throughGame).toBe(2)
    expect(flagged[0]?.outcomes[0]?.throughGame).toBe(3)
  })

  it('ignores a flag on a complete squad (RES-55)', async () => {
    const squad = openSquad({ complete: true })
    const walked = bowler()
    const deps = depsWith(squad, [
      { entry: walked, games: [300, 300] },
      { entry: leader, games: [250, 250, 250, 250] },
    ])
    const [worked] = await workOutSquads(deps, [squad], [open], {
      mode: 'full-game',
      flagged: new Map([[squad.id, new Set([walked.registrationId])]]),
    })

    expect(worked?.outcomes[0]?.throughGame).toBe(4)
    expect(worked?.outcomes[0]?.outcome.didNotFinish.map((e) => e.bowlerId)).toEqual([
      walked.bowlerId,
    ])
  })

  it('counts each division on its own (RES-40)', async () => {
    const squad = openSquad()
    const senior = createDivision({ number: 2, name: 'Senior' })
    const young = createLaneEntry({ divisionId: senior.id, average: null })
    const deps = depsWith(squad, [
      { entry: leader, games: [250, 250, 250] },
      { entry: young, games: [200] },
    ])
    const [worked] = await workOutSquads(deps, [squad], [open, senior], { mode: 'full-game' })

    const through = Object.fromEntries(
      (worked?.outcomes ?? []).map((o) => [o.divisionId, o.throughGame]),
    )
    expect(through).toEqual({ [open.id]: 3, [senior.id]: 1 })
  })
})
