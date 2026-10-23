import type { Division } from './types.ts'

/** What routes need from storage. Always sorted by number, then name (DIV-13, D-38). */
export interface DivisionRepository {
  listByTournament(tournamentId: string): Promise<Division[]>
}

/** Sort key for DIV-13 and D-38. Old rows may share a number, so the name breaks the tie. */
export function compareDivisions(a: Division, b: Division): number {
  return a.number - b.number || a.name.localeCompare(b.name)
}

/** Divisions stored with the tournament that owns them. */
export function createInMemoryDivisionRepository(
  seed: { tournamentId: string; division: Division }[],
): DivisionRepository {
  return {
    listByTournament: (tournamentId) =>
      Promise.resolve(
        seed
          .filter((entry) => entry.tournamentId === tournamentId)
          .map((entry) => ({ ...entry.division }))
          .sort(compareDivisions),
      ),
  }
}
