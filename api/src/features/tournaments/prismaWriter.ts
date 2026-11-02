import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { sameTournament, type TournamentWriter } from './writer.ts'

// Legacy stores a date as midnight in a `datetime(6)`; the read side cuts the same way (TRN-11).
const midnight = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`)
const isoDate = (value: Date) => value.toISOString().slice(0, 10)

/**
 * Writes the legacy `Tournaments` table (TRN-19). The duplicate check and the insert share one
 * transaction (D-123). `Completed` is always false (D-119).
 */
export function createPrismaTournamentWriter(
  client: PrismaClient,
  logger: Logger,
): TournamentWriter {
  return {
    create: (input) =>
      withDatabaseErrors(logger, () =>
        client.$transaction(async (tx) => {
          // Only rows that start on this date can clash, so read those and compare the name here:
          // the database collation decides case rules, and we want the same answer as the tests.
          const sameDay = await tx.tournament.findMany({
            where: { start: midnight(input.startDate) },
            select: { name: true, start: true },
          })
          if (
            sameDay.some((row) =>
              sameTournament({ name: row.name, startDate: isoDate(row.start) }, input),
            )
          ) {
            return { duplicate: true as const }
          }
          const row = await tx.tournament.create({
            data: {
              id: randomUUID(),
              name: input.name,
              start: midnight(input.startDate),
              end: midnight(input.endDate),
              entryFee: input.entryFee,
              games: input.games,
              finalsRatio: input.finalsRatio,
              cashRatio: input.cashRatio,
              superSweeperCashRatio: input.superSweeperCashRatio,
              bowlingCenter: input.bowlingCenter,
              completed: false,
            },
          })
          return { created: { id: row.id, ...input } }
        }),
      ),
  }
}
