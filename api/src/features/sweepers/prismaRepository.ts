import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { describeIssue } from '../../shared/describeIssue.ts'
import type { Logger } from '../../shared/logger.ts'
import type { SweeperRepository } from './repository.ts'
import { toSweeper } from './sweeperRow.ts'

/** `Squads.SquadType` for a sweeper. A squad is 0; any other value is not read (D-42). */
const sweeperType = 1

/** Reads the legacy `Squads` and `SweeperDivision` tables. Read only: add, edit, and delete come later. */
export function createPrismaSweeperRepository(
  client: PrismaClient,
  logger: Logger,
): SweeperRepository {
  return {
    async listByTournament(tournamentId) {
      const { rows, divisions, pins } = await withDatabaseErrors(logger, async () => {
        const sweepers = await client.squad.findMany({
          where: { tournamentId, squadType: sweeperType },
          // SQD-20, D-45.
          orderBy: [{ date: 'asc' }, { startingLane: 'asc' }, { id: 'asc' }],
        })
        return {
          rows: sweepers,
          // The tournament's own divisions, in DIV-13 order. A pin row for any other division is ignored.
          divisions: await client.division.findMany({
            where: { tournamentId },
            select: { id: true, name: true },
            orderBy: [{ number: 'asc' }, { name: 'asc' }],
          }),
          pins: await client.sweeperDivision.findMany({
            where: { sweeperId: { in: sweepers.map((sweeper) => sweeper.id) } },
          }),
        }
      })

      return rows.flatMap((row) => {
        const own = new Map(
          pins.filter((pin) => pin.sweeperId === row.id).map((pin) => [pin.divisionId, pin]),
        )
        const result = toSweeper(
          row,
          divisions.map(({ id, name }) => ({
            divisionId: id,
            divisionName: name,
            bonusPinsPerGame: own.get(id)?.bonusPinsPerGame,
          })),
        )
        if (result.success) return [result.data]
        // D-42: one old row must not hide the rest.
        logger.warn(
          { sweeperId: row.id, tournamentId, problems: result.error.issues.map(describeIssue) },
          'Skipped a stored sweeper that breaks the read shape',
        )
        return []
      })
    },
  }
}
