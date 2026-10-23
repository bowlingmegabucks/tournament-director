import { describe, expect, it } from 'vitest'
import { createSquad } from '../../test/factories.ts'
import { createInMemorySquadRepository } from './repository.ts'

const tournamentId = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'
const otherTournamentId = '2b9d6f3e-8a14-4e77-b0c2-5e1a9d7c3f02'

describe('in-memory squad repository', () => {
  it('lists only the squads of one tournament (SQD-21)', async () => {
    const mine = createSquad()
    const repository = createInMemorySquadRepository([
      { tournamentId, squad: mine },
      { tournamentId: otherTournamentId, squad: createSquad() },
    ])

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([mine])
  })

  it('sorts by date (SQD-20)', async () => {
    const morning = createSquad({ date: '2026-10-24T09:00:00' })
    const afternoon = createSquad({ date: '2026-10-24T13:00:00' })
    const sunday = createSquad({ date: '2026-10-25T09:00:00' })
    const repository = createInMemorySquadRepository(
      [sunday, morning, afternoon].map((squad) => ({ tournamentId, squad })),
    )

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([
      morning,
      afternoon,
      sunday,
    ])
  })

  it('breaks a date tie by starting lane, then id (SQD-20, D-45)', async () => {
    const date = '2026-10-24T09:00:00'
    const first = createSquad({ date, startingLane: 1, id: 'b' })
    const second = createSquad({ date, startingLane: 1, id: 'c' })
    const third = createSquad({ date, startingLane: 13, id: 'a' })
    const repository = createInMemorySquadRepository(
      [third, second, first].map((squad) => ({ tournamentId, squad })),
    )

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([first, second, third])
  })

  it('returns copies, so callers cannot change stored data', async () => {
    const stored = createSquad({ startingLane: 1 })
    const repository = createInMemorySquadRepository([{ tournamentId, squad: stored }])

    const [first] = await repository.listByTournament(tournamentId)
    if (first) first.startingLane = 99

    expect(stored.startingLane).toBe(1)
  })
})
