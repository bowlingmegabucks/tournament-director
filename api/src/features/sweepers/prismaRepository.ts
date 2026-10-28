import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { describeIssue } from '../../shared/describeIssue.ts'
import type { Logger } from '../../shared/logger.ts'
import { compareSessions } from '../../shared/sessions.ts'
import type { SweeperRepository } from './repository.ts'
import { toSweeper, type DivisionPins } from './sweeperRow.ts'

/** `Squads.SquadType` for a sweeper. A squad is 0; any other value is not read (D-42). */
const sweeperType = 1

/** Reads the legacy `Squads` and `SweeperDivision` tables. Read only: add, edit, and delete come later. */
export function createPrismaSweeperRepository(
  client: PrismaClient,
  logger: Logger,
): SweeperRepository {
  return {
    async listByTournament(tournamentId) {
      // The sweepers and their pins do not depend on each other, so they load together. A pin row
      // for a division of another tournament is left out by the `division` filter.
      const [rows, pinRows] = await withDatabaseErrors(logger, () =>
        Promise.all([
          client.squad.findMany({ where: { tournamentId, squadType: sweeperType } }),
          client.sweeperDivision.findMany({
            where: {
              sweeper: { tournamentId, squadType: sweeperType },
              division: { tournamentId },
            },
            include: { division: { select: { name: true, number: true } } },
          }),
        ]),
      )

      // Group once by sweeper, then put each sweeper's divisions in DIV-13 order.
      const pinsBySweeper = new Map<string, (DivisionPins & { number: number })[]>()
      for (const pin of pinRows) {
        const own = pinsBySweeper.get(pin.sweeperId) ?? []
        own.push({
          divisionId: pin.divisionId,
          divisionName: pin.division.name,
          bonusPinsPerGame: pin.bonusPinsPerGame,
          number: pin.division.number,
        })
        pinsBySweeper.set(pin.sweeperId, own)
      }

      const sweepers = rows.flatMap((row) => {
        const own = (pinsBySweeper.get(row.id) ?? []).sort(
          (a, b) => a.number - b.number || a.divisionName.localeCompare(b.divisionName),
        )
        const result = toSweeper(row, own)
        if (result.success) return [result.data]
        // D-42: one old row must not hide the rest.
        logger.warn(
          { sweeperId: row.id, tournamentId, problems: result.error.issues.map(describeIssue) },
          'Skipped a stored sweeper that breaks the read shape',
        )
        return []
      })
      // SQD-20, D-45. Sorted here, not by the database, so one function decides every tie.
      return sweepers.sort(compareSessions)
    },
  }
}
