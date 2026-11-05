import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import type { NewDivision } from './createRequest.ts'
import {
  applyCreate,
  toNewDivision,
  type CreateDivisionOutcome,
  type DivisionWriter,
} from './writer.ts'

// 0 = Male, 1 = Female, NULL = any gender (database.md).
const genderCode = { Male: 0, Female: 1 } as const

/** The column holds a fraction with two places: 90 is `0.90`. A string keeps float noise out. */
const fractionOf = (percent: number) => (percent / 100).toFixed(2)

/**
 * Writes the legacy `Divisions` table (DIV-12). The number, the name check, and the insert share
 * one serializable transaction (D-139, D-140), so two creates at once cannot take the same number
 * or name. The tournament's `Completed` flag is read in it too (D-143).
 */
export function createPrismaDivisionWriter(client: PrismaClient, logger: Logger): DivisionWriter {
  const createOnce = (
    tournamentId: string,
    input: NewDivision,
    confirmWarnings: boolean,
  ): Promise<CreateDivisionOutcome> =>
    client.$transaction(
      async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id: tournamentId },
          select: { completed: true },
        })
        if (!tournament) return { notFound: true as const }
        const divisions = await tx.division.findMany({
          where: { tournamentId },
          select: { number: true, name: true },
        })
        return applyCreate(
          { completed: tournament.completed, divisions },
          input,
          confirmWarnings,
          async (number) => {
            const id = randomUUID()
            await tx.division.create({
              data: {
                id,
                tournamentId,
                number,
                name: input.name,
                gender: input.gender === null ? null : genderCode[input.gender],
                minimumAge: input.minimumAge,
                maximumAge: input.maximumAge,
                minimumAverage: input.minimumAverage,
                maximumAverage: input.maximumAverage,
                handicapPercentage:
                  input.handicapPercentage === null ? null : fractionOf(input.handicapPercentage),
                handicapBase: input.handicapBase,
                maximumHandicapPerGame: input.maximumHandicapPerGame,
              },
            })
            return toNewDivision(id, number, input)
          },
        )
      },
      // The reads lock the range they saw, so a second create cannot slip in between (D-139).
      { isolationLevel: 'Serializable' },
    )

  return {
    create: (tournamentId, input, { confirmWarnings }) =>
      withDatabaseErrors(logger, () =>
        withRetry(() => createOnce(tournamentId, input, confirmWarnings)),
      ),
  }
}
