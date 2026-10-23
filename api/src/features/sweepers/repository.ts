import { compareSessions } from '../../shared/sessions.ts'
import type { Sweeper } from './types.ts'

/** What routes need from storage. Always sorted by date, then starting lane, then id (SQD-20, D-45). */
export interface SweeperRepository {
  listByTournament(tournamentId: string): Promise<Sweeper[]>
}

/** Sweepers stored with the tournament that owns them. */
export function createInMemorySweeperRepository(
  seed: { tournamentId: string; sweeper: Sweeper }[],
): SweeperRepository {
  return {
    listByTournament: (tournamentId) =>
      Promise.resolve(
        seed
          .filter((entry) => entry.tournamentId === tournamentId)
          .map((entry) => ({
            ...entry.sweeper,
            bonusPins: entry.sweeper.bonusPins.map((pins) => ({ ...pins })),
          }))
          .sort(compareSessions),
      ),
  }
}
