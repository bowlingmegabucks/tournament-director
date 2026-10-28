import { describe, expect, it } from 'vitest'
import { createSweeper } from '../../test/factories.ts'
import { createInMemorySweeperRepository } from './repository.ts'

const tournamentId = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'
const otherTournamentId = '2b9d6f3e-8a14-4e77-b0c2-5e1a9d7c3f02'

describe('in-memory sweeper repository', () => {
  it('lists only the sweepers of one tournament (SQD-22)', async () => {
    const mine = createSweeper()
    const repository = createInMemorySweeperRepository([
      { tournamentId, sweeper: mine },
      { tournamentId: otherTournamentId, sweeper: createSweeper() },
    ])

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([mine])
  })

  it('sorts by date, then starting lane, then id (SQD-20, D-45)', async () => {
    const date = '2026-10-24T18:00:00'
    const early = createSweeper({ date: '2026-10-24T12:00:00', id: 'z' })
    const first = createSweeper({ date, startingLane: 1, id: 'b' })
    const second = createSweeper({ date, startingLane: 1, id: 'c' })
    const third = createSweeper({ date, startingLane: 13, id: 'a' })
    const repository = createInMemorySweeperRepository(
      [third, second, early, first].map((sweeper) => ({ tournamentId, sweeper })),
    )

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([
      early,
      first,
      second,
      third,
    ])
  })

  it('returns copies, so callers cannot change stored data', async () => {
    const stored = createSweeper({
      bonusPins: [{ divisionId: crypto.randomUUID(), divisionName: 'Open', bonusPinsPerGame: 10 }],
    })
    const repository = createInMemorySweeperRepository([{ tournamentId, sweeper: stored }])

    const [first] = await repository.listByTournament(tournamentId)
    if (first) {
      first.startingLane = 99
      const [pins] = first.bonusPins
      if (pins) pins.bonusPinsPerGame = 99
    }

    expect(stored.startingLane).toBe(1)
    expect(stored.bonusPins[0]?.bonusPinsPerGame).toBe(10)
  })
})
