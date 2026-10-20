import { describe, expect, it } from 'vitest'
import { createInMemoryTournamentRepository } from './repository.ts'
import { createTournament, createTournaments } from '../../test/factories.ts'

describe('in-memory tournament repository', () => {
  it('lists what it was seeded with', async () => {
    const seed = createTournaments(3)

    expect(await createInMemoryTournamentRepository(seed).list()).toEqual(seed)
  })

  it('lists nothing when empty', async () => {
    expect(await createInMemoryTournamentRepository([]).list()).toEqual([])
  })

  it('returns copies, so callers cannot change stored data', async () => {
    const repository = createInMemoryTournamentRepository([createTournament({ name: 'Original' })])

    const [first] = await repository.list()
    if (!first) throw new Error('expected a tournament')
    first.name = 'Changed'

    expect((await repository.list())[0]?.name).toBe('Original')
  })
})
