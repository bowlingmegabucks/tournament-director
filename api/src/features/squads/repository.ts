import { compareSessions } from '../../shared/sessions.ts'
import type { Squad } from './types.ts'

/** What routes need from storage. Always sorted by date, then starting lane, then id (SQD-20, D-45). */
export interface SquadRepository {
  listByTournament(tournamentId: string): Promise<Squad[]>
}

/** Squads stored with the tournament that owns them. */
export function createInMemorySquadRepository(
  seed: { tournamentId: string; squad: Squad }[],
): SquadRepository {
  return {
    listByTournament: (tournamentId) =>
      Promise.resolve(
        seed
          .filter((entry) => entry.tournamentId === tournamentId)
          .map((entry) => ({ ...entry.squad }))
          .sort(compareSessions),
      ),
  }
}
