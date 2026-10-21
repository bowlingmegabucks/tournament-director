import type { Tournament } from './types.ts'

/** What routes need from storage. A database version replaces the in-memory one without touching routes. */
export interface TournamentRepository {
  list(): Promise<Tournament[]>
  get(id: string): Promise<Tournament | undefined>
}

export function createInMemoryTournamentRepository(seed: Tournament[]): TournamentRepository {
  return {
    // Return copies so callers cannot change the stored data.
    list: () => Promise.resolve(seed.map((tournament) => ({ ...tournament }))),
    get: (id) => {
      const found = seed.find((tournament) => tournament.id === id)
      return Promise.resolve(found && { ...found })
    },
  }
}
