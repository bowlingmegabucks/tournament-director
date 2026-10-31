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

  it('gets one by id', async () => {
    const seed = createTournaments(3)

    expect(await createInMemoryTournamentRepository(seed).get(seed[1]?.id ?? '')).toEqual(seed[1])
  })

  it('gets nothing for an unknown id', async () => {
    const repository = createInMemoryTournamentRepository(createTournaments(2))

    expect(await repository.get('7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01')).toBeUndefined()
  })

  it('returns a copy from get', async () => {
    const tournament = createTournament({ name: 'Original' })
    const repository = createInMemoryTournamentRepository([tournament])

    const found = await repository.get(tournament.id)
    if (!found) throw new Error('expected a tournament')
    found.name = 'Changed'

    expect((await repository.get(tournament.id))?.name).toBe('Original')
  })
  it('gets the ratios of a known tournament, from the seed or the default (RES-12, RES-28)', async () => {
    const withRatios = createTournament()
    const withDefaults = createTournament()
    const repository = createInMemoryTournamentRepository([withRatios, withDefaults], {
      [withRatios.id]: { finalsRatio: 7, superSweeperCashRatio: 4.5 },
    })

    expect(await repository.getRatios(withRatios.id)).toEqual({
      finalsRatio: 7,
      superSweeperCashRatio: 4.5,
    })
    expect(await repository.getRatios(withDefaults.id)).toEqual({
      finalsRatio: 8,
      superSweeperCashRatio: 8,
    })
  })

  it('gets undefined ratios for an unknown tournament', async () => {
    const repository = createInMemoryTournamentRepository([createTournament()])

    expect(await repository.getRatios('7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01')).toBeUndefined()
  })
})
