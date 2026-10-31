import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { describeIssue } from '../../shared/describeIssue.ts'
import type { Logger } from '../../shared/logger.ts'
import { toLaneEntry } from './entryRow.ts'
import type { LaneRepository } from './repository.ts'

/**
 * Reads who entered one squad or sweeper from the legacy `SquadRegistration` table, with the
 * registration and bowler. Read only: moves come later (D-55).
 */
export function createPrismaLaneRepository(client: PrismaClient, logger: Logger): LaneRepository {
  // A bad row stays bad on every visit and refetch. Say so once per process (D-51).
  const reported = new Set<string>()

  return {
    async listEntries(sessionId) {
      const rows = await withDatabaseErrors(logger, () =>
        client.squadRegistration.findMany({
          where: { squadId: sessionId },
          // Named columns only: the bowler's SSN, birth date, and contact details are never read (BWL-17).
          select: {
            registrationId: true,
            laneAssignment: true,
            registration: {
              select: {
                id: true,
                bowlerId: true,
                average: true,
                superSweeper: true,
                divisionId: true,
                bowler: { select: { firstName: true, lastName: true, suffix: true } },
              },
            },
          },
        }),
      )
      return rows.flatMap((row) => {
        const result = toLaneEntry(row)
        if (result.success) return [result.data]
        const key = `skipped:${sessionId}:${row.registrationId}`
        if (!reported.has(key)) {
          reported.add(key)
          logger.warn(
            {
              registrationId: row.registrationId,
              sessionId,
              problems: result.error.issues.map(describeIssue),
            },
            'Skipped a stored lane entry that breaks the read shape',
          )
        }
        return []
      })
    },
  }
}
