import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import type { NewTournament } from './createRequest.ts'
import { sameTournament, type CreateTournamentOutcome, type TournamentWriter } from './writer.ts'

// Legacy stores a date as midnight in a `datetime(6)`; the read side cuts the same way (TRN-11).
const midnight = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`)
const isoDate = (value: Date) => value.toISOString().slice(0, 10)
const DAY_MS = 24 * 60 * 60 * 1000

// Two creates that read at once and then insert deadlock under Serializable; MariaDB rolls one
// back, and Prisma reports it as P2034. The retry then sees the first row and says "duplicate".
const writeConflict = 'P2034'
const MAX_ATTEMPTS = 3

function isWriteConflict(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === writeConflict
  )
}

/**
 * Writes the legacy `Tournaments` table (TRN-19). The duplicate check and the insert share one
 * serializable transaction (D-123). `Completed` is always false (D-119).
 */
export function createPrismaTournamentWriter(
  client: PrismaClient,
  logger: Logger,
): TournamentWriter {
  const attempt = (input: NewTournament) =>
    client.$transaction(
      async (tx) => {
        // Legacy may hold a start with a time of day, so look at the whole day, not midnight only.
        // Compare the name here: the database collation decides case rules, and the tests must
        // give the same answer.
        const dayStart = midnight(input.startDate)
        const sameDay = await tx.tournament.findMany({
          where: { start: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) } },
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
            start: dayStart,
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
      },
      // The read locks the range it saw, so a second create cannot slip in between (D-123).
      { isolationLevel: 'Serializable' },
    )

  // One try after another, never together: a retry has to see what the first try's rival wrote.
  const attemptWithRetry = async (
    input: NewTournament,
    tries: number,
  ): Promise<CreateTournamentOutcome> => {
    try {
      return await attempt(input)
    } catch (error) {
      if (!isWriteConflict(error) || tries >= MAX_ATTEMPTS) throw error
      return attemptWithRetry(input, tries + 1)
    }
  }

  return {
    create: (input) => withDatabaseErrors(logger, () => attemptWithRetry(input, 1)),
  }
}
