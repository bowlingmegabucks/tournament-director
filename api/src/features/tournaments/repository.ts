import type { Tournament, TournamentRatios } from './types.ts'

/** What routes need from storage. A database version replaces the in-memory one without touching routes. */
export interface TournamentRepository {
  list(): Promise<Tournament[]>
  get(id: string): Promise<Tournament | undefined>
  /** The finals and super sweeper cash ratios (RES-12, RES-28). `undefined` for an unknown id. */
  getRatios(id: string): Promise<TournamentRatios | undefined>
}

const defaultRatios: TournamentRatios = { finalsRatio: 8, superSweeperCashRatio: 8 }

export function createInMemoryTournamentRepository(
  seed: Tournament[],
  ratios: Record<string, TournamentRatios> = {},
): TournamentRepository {
  return {
    // Return copies so callers cannot change the stored data.
    list: () => Promise.resolve(seed.map((tournament) => ({ ...tournament }))),
    get: (id) => {
      const found = seed.find((tournament) => tournament.id === id)
      return Promise.resolve(found && { ...found })
    },
    getRatios: (id) => {
      const found = seed.some((tournament) => tournament.id === id)
      return Promise.resolve(found ? { ...(ratios[id] ?? defaultRatios) } : undefined)
    },
  }
}
