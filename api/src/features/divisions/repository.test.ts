import { describe, expect, it } from 'vitest'
import { createDivision } from '../../test/factories.ts'
import { createInMemoryDivisionRepository } from './repository.ts'

const tournamentId = '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01'
const otherTournamentId = '2b9d6f3e-8a14-4e77-b0c2-5e1a9d7c3f02'

describe('in-memory division repository', () => {
  it('lists only the divisions of one tournament (DIV-12)', async () => {
    const mine = createDivision()
    const repository = createInMemoryDivisionRepository([
      { tournamentId, division: mine },
      { tournamentId: otherTournamentId, division: createDivision() },
    ])

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([mine])
  })

  it('sorts by number (DIV-13)', async () => {
    const one = createDivision({ number: 1 })
    const two = createDivision({ number: 2 })
    const three = createDivision({ number: 3 })
    const repository = createInMemoryDivisionRepository(
      [three, one, two].map((division) => ({ tournamentId, division })),
    )

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([one, two, three])
  })

  it('breaks a tie on number by name (D-38)', async () => {
    const [a, b] = [
      createDivision({ number: 4, name: 'Alpha' }),
      createDivision({ number: 4, name: 'Bravo' }),
    ]
    const repository = createInMemoryDivisionRepository(
      [b, a].map((division) => ({ tournamentId, division })),
    )

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([a, b])
  })

  it('returns copies, so callers cannot change stored data', async () => {
    const stored = createDivision({ name: 'Open' })
    const repository = createInMemoryDivisionRepository([{ tournamentId, division: stored }])

    const [first] = await repository.listByTournament(tournamentId)
    if (first) first.name = 'Changed'

    expect(stored.name).toBe('Open')
  })
})
