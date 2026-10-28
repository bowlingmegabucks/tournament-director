import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { describeIssue } from '../../shared/describeIssue.ts'
import type { Logger } from '../../shared/logger.ts'
import { toRegistration } from './registrationRow.ts'
import { compareRegistrations, type RegistrationRepository } from './repository.ts'

/**
 * Reads the legacy `Registrations` table with its bowler, division name, and squad links. Read
 * only: create, change, and delete come later. The tournament comes from the division, since the
 * table has no TournamentId (Q-26).
 */
export function createPrismaRegistrationRepository(
  client: PrismaClient,
  logger: Logger,
): RegistrationRepository {
  // A bad row stays bad on every visit and refetch. Say so once per process, so the log keeps room
  // for new problems.
  const reported = new Set<string>()
  const warnOnce = (key: string, fields: Record<string, unknown>, message: string) => {
    if (reported.has(key)) return
    reported.add(key)
    logger.warn(fields, message)
  }

  return {
    async listByTournament(tournamentId) {
      const rows = await withDatabaseErrors(logger, () =>
        client.registration.findMany({
          where: { division: { tournamentId } },
          // Named columns only: the bowler's SSN, birth date, and contact details are never read (BWL-17).
          select: {
            id: true,
            superSweeper: true,
            divisionId: true,
            division: { select: { name: true } },
            bowler: {
              select: { id: true, firstName: true, lastName: true, suffix: true, usbcId: true },
            },
            // Only this tournament's squads come back; `toRegistration` still guards the mapping.
            squads: {
              where: { squad: { tournamentId } },
              select: { squad: { select: { id: true, tournamentId: true, squadType: true } } },
            },
          },
        }),
      )
      const registrations = rows.flatMap((row) => {
        const result = toRegistration(row, tournamentId)
        if (result.success) return [result.data]
        // D-51: one old row must not hide the rest.
        warnOnce(
          `skipped:${row.id}`,
          {
            registrationId: row.id,
            tournamentId,
            problems: result.error.issues.map(describeIssue),
          },
          'Skipped a stored registration that breaks the read shape',
        )
        return []
      })

      // D-48: the old index allows a second registration for one bowler in a tournament. Show
      // both, and say so, so someone can fix the data by hand.
      const idsByBowler = new Map<string, string[]>()
      for (const { id, bowler } of registrations) {
        idsByBowler.set(bowler.id, [...(idsByBowler.get(bowler.id) ?? []), id])
      }
      for (const [bowlerId, registrationIds] of idsByBowler) {
        if (registrationIds.length > 1) {
          warnOnce(
            `duplicate:${tournamentId}:${bowlerId}`,
            { bowlerId, tournamentId, registrationIds },
            'A bowler has more than one registration in this tournament',
          )
        }
      }

      // REG-23, D-51. Sorted here, not by the database, so one function decides every tie.
      return registrations.sort(compareRegistrations)
    },
  }
}
