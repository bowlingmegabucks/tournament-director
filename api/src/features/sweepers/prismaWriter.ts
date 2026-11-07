import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import type { NewSweeper } from './createRequest.ts'
import {
  applyCreate,
  pinRows,
  toCreatedSweeper,
  type CreateSweeperOutcome,
  type SweeperWriter,
} from './writer.ts'

/** `Squads.SquadType` for a sweeper (a squad is 0). */
const sweeperType = 1

const isoDate = (value: Date) => value.toISOString().slice(0, 10)

/** The legacy column holds the center's local time as digits; Prisma reads and writes them as UTC. */
const storedDate = (localDateTime: string) => new Date(`${localDateTime}.000Z`)

/**
 * Writes the legacy `Squads` and `SweeperDivision` tables (SQD-10 to SQD-13). The tournament's
 * `Completed` flag and dates, its divisions, the sweeper row, and the pin rows share one
 * transaction (D-178), so no sweeper exists with half its pins. It is not serializable: nothing
 * here must be unique, and a serializable read would lock tournament rows that the WinForms app
 * writes.
 */
export function createPrismaSweeperWriter(client: PrismaClient, logger: Logger): SweeperWriter {
  const createOnce = (tournamentId: string, input: NewSweeper): Promise<CreateSweeperOutcome> =>
    client.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({
        where: { id: tournamentId },
        select: { completed: true, start: true, end: true },
      })
      if (!tournament) return { notFound: true as const }
      const divisions = await tx.division.findMany({
        where: { tournamentId },
        select: { id: true, name: true, number: true },
      })
      return applyCreate(
        {
          completed: tournament.completed,
          startDate: isoDate(tournament.start),
          endDate: isoDate(tournament.end),
          divisionIds: new Set(divisions.map((division) => division.id)),
        },
        input,
        async () => {
          const id = randomUUID()
          await tx.squad.create({
            data: {
              id,
              tournamentId,
              squadType: sweeperType,
              date: storedDate(input.date),
              maxPerPair: input.maxPerPair,
              startingLane: input.startingLane,
              numberOfLanes: input.numberOfLanes,
              complete: false,
              sweeperEntryFee: input.entryFee,
              games: input.games,
              cashRatio: input.cashRatio,
            },
          })
          const rows = pinRows(input)
          if (rows.length > 0) {
            await tx.sweeperDivision.createMany({
              data: rows.map((row) => ({ sweeperId: id, ...row })),
            })
          }
          return toCreatedSweeper(id, input, divisions)
        },
      )
    })

  return {
    create: (tournamentId, input) =>
      withDatabaseErrors(logger, () => createOnce(tournamentId, input)),
  }
}
