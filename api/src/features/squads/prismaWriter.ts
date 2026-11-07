import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import type { NewSquad } from './createRequest.ts'
import { applyCreate, toCreatedSquad, type CreateSquadOutcome, type SquadWriter } from './writer.ts'

/** `Squads.SquadType` for a qualifying squad (a sweeper is 1). */
const squadType = 0

const isoDate = (value: Date) => value.toISOString().slice(0, 10)

/** The legacy column holds the center's local time as digits; Prisma reads and writes them as UTC. */
const storedDate = (localDateTime: string) => new Date(`${localDateTime}.000Z`)

/**
 * Writes the legacy `Squads` table (SQD-01 to SQD-08). The tournament's `Completed` flag, its dates,
 * and the insert share one transaction (D-171). It is not serializable: nothing here must be unique,
 * and a serializable read would lock tournament rows that the WinForms app writes.
 */
export function createPrismaSquadWriter(client: PrismaClient, logger: Logger): SquadWriter {
  const createOnce = (tournamentId: string, input: NewSquad): Promise<CreateSquadOutcome> =>
    client.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({
        where: { id: tournamentId },
        select: {
          completed: true,
          start: true,
          end: true,
          entryFee: true,
          finalsRatio: true,
          cashRatio: true,
          games: true,
        },
      })
      if (!tournament) return { notFound: true as const }
      const defaults = {
        entryFee: tournament.entryFee.toNumber(),
        finalsRatio: tournament.finalsRatio.toNumber(),
        cashRatio: tournament.cashRatio.toNumber(),
        games: tournament.games,
      }
      return applyCreate(
        {
          completed: tournament.completed,
          startDate: isoDate(tournament.start),
          endDate: isoDate(tournament.end),
        },
        input,
        async () => {
          const id = randomUUID()
          await tx.squad.create({
            data: {
              id,
              tournamentId,
              squadType,
              date: storedDate(input.date),
              maxPerPair: input.maxPerPair,
              startingLane: input.startingLane,
              numberOfLanes: input.numberOfLanes,
              complete: false,
              squadEntryFee: input.entryFee,
              finalsRatio: input.finalsRatio,
              cashRatio: input.cashRatio,
            },
          })
          return toCreatedSquad(id, input, defaults)
        },
      )
    })

  return {
    create: (tournamentId, input) =>
      withDatabaseErrors(logger, () => createOnce(tournamentId, input)),
  }
}
