import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import type { NewDivision } from './createRequest.ts'
import { loadDivisionEditFacts } from './prismaEditFacts.ts'
import { toDivision } from './divisionRow.ts'
import type { UpdateDivision } from './updateRequest.ts'
import {
  applyCreate,
  applyUpdate,
  toNewDivision,
  type CreateDivisionOutcome,
  type DivisionWriter,
  type UpdateDivisionOutcome,
} from './writer.ts'

// 0 = Male, 1 = Female, NULL = any gender (database.md).
const genderCode = { Male: 0, Female: 1 } as const

/** The column holds a fraction with two places: 90 is `0.90`. A string keeps float noise out. */
const fractionOf = (percent: number) => (percent / 100).toFixed(2)

/** The columns for the fields given. A field left out is left out, so an update changes only what was sent. */
function columnsFor(fields: UpdateDivision) {
  const { gender, handicapPercentage, ...plain } = fields
  return {
    ...plain,
    ...(gender !== undefined && { gender: gender === null ? null : genderCode[gender] }),
    ...(handicapPercentage !== undefined && {
      handicapPercentage: handicapPercentage === null ? null : fractionOf(handicapPercentage),
    }),
  }
}

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
              data: { id, tournamentId, number, ...columnsFor(input), name: input.name },
            })
            return toNewDivision(id, number, input)
          },
        )
      },
      // The reads lock the range they saw, so a second create cannot slip in between (D-139).
      { isolationLevel: 'Serializable' },
    )

  const updateOnce = async (
    tournamentId: string,
    divisionId: string,
    changes: UpdateDivision,
    confirmWarnings: boolean,
  ): Promise<UpdateDivisionOutcome> => {
    // Read the counts before the transaction. Under Serializable, MariaDB turns every read into a
    // locking read, and WinForms writes registrations and scores in these tables; a lock here would
    // stall a score keeper. A score that lands in the next few milliseconds is the same race as one
    // that lands just after the save (the tournament edit does the same).
    const facts = await loadDivisionEditFacts(client, tournamentId, divisionId)
    return client.$transaction(
      async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id: tournamentId },
          select: { completed: true },
        })
        if (!tournament) return { notFound: 'tournament' as const }
        // The tournament in the URL must own the division: another tournament's id is not found.
        const row = await tx.division.findFirst({ where: { id: divisionId, tournamentId } })
        if (!row) return { notFound: 'division' as const }
        const stored = toDivision(row)
        if (!stored.success) {
          // The list skips such a row, so no Edit link leads here; a stale page or a typed URL can.
          // Say why, as a refusal, instead of a 500 the director cannot act on.
          logger.warn({ divisionId, tournamentId }, 'Stored division breaks the read shape')
          return {
            refused: {
              name: 'This division holds values the app cannot read, so it cannot be edited here.',
            },
          }
        }
        const others = await tx.division.findMany({
          where: { tournamentId, id: { not: divisionId } },
          select: { name: true },
        })
        return applyUpdate(
          {
            tournamentCompleted: tournament.completed,
            stored: stored.data,
            facts,
            otherNames: others.map((other) => other.name),
          },
          changes,
          confirmWarnings,
          async (saved) => {
            await tx.division.update({ where: { id: divisionId }, data: columnsFor(saved) })
          },
        )
      },
      // The name check and the write must not interleave with another edit or add (D-140).
      { isolationLevel: 'Serializable' },
    )
  }

  return {
    create: (tournamentId, input, { confirmWarnings }) =>
      withDatabaseErrors(logger, () =>
        withRetry(() => createOnce(tournamentId, input, confirmWarnings)),
      ),
    update: (tournamentId, divisionId, changes, { confirmWarnings }) =>
      withDatabaseErrors(logger, () =>
        withRetry(() => updateOnce(tournamentId, divisionId, changes, confirmWarnings)),
      ),
    getEditInfo: (tournamentId, divisionId) =>
      withDatabaseErrors(logger, async () => {
        const tournament = await client.tournament.findUnique({
          where: { id: tournamentId },
          select: { id: true },
        })
        if (!tournament) return { notFound: 'tournament' as const }
        const row = await client.division.findFirst({
          where: { id: divisionId, tournamentId },
          select: { id: true },
        })
        if (!row) return { notFound: 'division' as const }
        return loadDivisionEditFacts(client, tournamentId, divisionId)
      }),
  }
}
