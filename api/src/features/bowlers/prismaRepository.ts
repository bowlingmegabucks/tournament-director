import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { displayName } from '../registrations/registrationRow.ts'
import { compareBowlers, toOutcome, type BowlerRepository } from './repository.ts'
import { searchLimit, type BowlerSearchResult } from './types.ts'

/**
 * Prisma passes a `startsWith` value into `LIKE` as it is, so a typed `%` or `_` would match
 * anything. MariaDB reads a backslash as the escape character; put one before each wildcard (and
 * before a backslash itself) so the desk's text means itself.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`)
}

/**
 * Searches the legacy `Bowlers` table (BWL-14, D-157). Names are read by named columns only: the
 * SSN, birth date, email, phone, and street are never selected (BWL-17). Text compares follow the
 * database collation, which ignores case.
 */
export function createPrismaBowlerRepository(
  client: PrismaClient,
  logger: Logger,
): BowlerRepository {
  return {
    async search(filter) {
      const rows = await withDatabaseErrors(logger, () =>
        client.bowler.findMany({
          where: {
            ...(filter.lastName === undefined
              ? {}
              : { lastName: { startsWith: escapeLike(filter.lastName) } }),
            ...(filter.firstName === undefined
              ? {}
              : { firstName: { startsWith: escapeLike(filter.firstName) } }),
            ...(filter.email === undefined ? {} : { email: filter.email }),
            ...(filter.usbcId === undefined ? {} : { usbcId: filter.usbcId }),
          },
          // The database picks the first rows by name; one extra row says there were more.
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
          take: searchLimit + 1,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            suffix: true,
            usbcId: true,
            city: true,
            state: true,
            // With no tournament asked about, `in: []` matches nothing, so every `registered` is null.
            registrations: {
              where:
                filter.tournamentId === undefined
                  ? { id: { in: [] } }
                  : { division: { tournamentId: filter.tournamentId } },
              take: 1,
              select: { division: { select: { name: true } } },
            },
          },
        }),
      )
      const results = rows.map((row): BowlerSearchResult => {
        const registration = row.registrations[0]
        return {
          id: row.id,
          name: displayName(row),
          firstName: row.firstName,
          lastName: row.lastName,
          usbcId: row.usbcId,
          city: row.city,
          state: row.state,
          registered: registration ? { divisionName: registration.division.name } : null,
        }
      })
      // Sorted again here so one function decides every tie, as the registration list does (D-51).
      return toOutcome(results.sort(compareBowlers))
    },
  }
}
