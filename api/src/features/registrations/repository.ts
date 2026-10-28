import type { Registration } from './types.ts'

/** What routes need from storage. Always sorted as `compareRegistrations` says (REG-23, D-51). */
export interface RegistrationRepository {
  listByTournament(tournamentId: string): Promise<Registration[]>
}

// Ignores case and accents, as the database collation does (BWL-14).
function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

/**
 * REG-23, D-51: last name, then first name, then registration id, so two bowlers with one name
 * keep a stable order. The id is compared as plain text, the same way in tests and in the app.
 */
export function compareRegistrations(a: Registration, b: Registration): number {
  const byName =
    compareText(a.bowler.lastName, b.bowler.lastName) ||
    compareText(a.bowler.firstName, b.bowler.firstName)
  if (byName !== 0) return byName
  if (a.id < b.id) return -1
  return a.id > b.id ? 1 : 0
}

/** Registrations stored with the tournament that owns them. */
export function createInMemoryRegistrationRepository(
  seed: { tournamentId: string; registration: Registration }[],
): RegistrationRepository {
  return {
    listByTournament: (tournamentId) =>
      Promise.resolve(
        seed
          .filter((entry) => entry.tournamentId === tournamentId)
          .map((entry) => ({ ...entry.registration }))
          .sort(compareRegistrations),
      ),
  }
}
