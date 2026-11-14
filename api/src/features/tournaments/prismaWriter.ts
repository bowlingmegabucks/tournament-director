import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import type { NewTournament } from './createRequest.ts'
import type { DeleteCounts } from './deletePlan.ts'
import { createTournamentCompleter } from './prismaComplete.ts'
import { loadDeleteFacts } from './prismaDeleteFacts.ts'
import { loadEditFacts } from './prismaEditFacts.ts'
import type { UpdateTournament } from './updateRequest.ts'
import {
  applyDelete,
  applyEdit,
  sameTournament,
  type CreateTournamentOutcome,
  type DeleteTournamentOutcome,
  type TournamentWriter,
  type UpdateTournamentOutcome,
} from './writer.ts'

// Legacy stores a date as midnight in a `datetime(6)`; the read side cuts the same way (TRN-11).
const midnight = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`)
const isoDate = (value: Date) => value.toISOString().slice(0, 10)
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Does another tournament hold this name and start date (D-123)? `exceptId` leaves out the one
 * being edited. Legacy may hold a start with a time of day, so look at the whole day, not midnight
 * only. Compare the name here: the database collation decides case rules, and the tests must give
 * the same answer.
 */
async function hasSameTournament(
  tx: Pick<PrismaClient, 'tournament'>,
  input: { name: string; startDate: string },
  exceptId?: string,
): Promise<boolean> {
  const dayStart = midnight(input.startDate)
  const sameDay = await tx.tournament.findMany({
    where: {
      start: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) },
      ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
    },
    select: { name: true, start: true },
  })
  return sameDay.some((row) =>
    sameTournament({ name: row.name, startDate: isoDate(row.start) }, input),
  )
}

/** Column values for the fields an edit changed. */
function columnsFor(changes: Partial<NewTournament>) {
  return {
    ...(changes.name === undefined ? {} : { name: changes.name }),
    ...(changes.startDate === undefined ? {} : { start: midnight(changes.startDate) }),
    ...(changes.endDate === undefined ? {} : { end: midnight(changes.endDate) }),
    ...(changes.bowlingCenter === undefined ? {} : { bowlingCenter: changes.bowlingCenter }),
    ...(changes.entryFee === undefined ? {} : { entryFee: changes.entryFee }),
    ...(changes.games === undefined ? {} : { games: changes.games }),
    ...(changes.finalsRatio === undefined ? {} : { finalsRatio: changes.finalsRatio }),
    ...(changes.cashRatio === undefined ? {} : { cashRatio: changes.cashRatio }),
    ...(changes.superSweeperCashRatio === undefined
      ? {}
      : { superSweeperCashRatio: changes.superSweeperCashRatio }),
  }
}

/**
 * Writes the legacy `Tournaments` table (TRN-19, TRN-24). The duplicate check and the write share
 * one serializable transaction (D-123). Create stores `Completed` false (D-119); edit never writes
 * it (D-130).
 */
export function createPrismaTournamentWriter(
  client: PrismaClient,
  logger: Logger,
): TournamentWriter {
  const createOnce = (input: NewTournament): Promise<CreateTournamentOutcome> =>
    client.$transaction(
      async (tx) => {
        if (await hasSameTournament(tx, input)) return { duplicate: true as const }
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
      },
      // The read locks the range it saw, so a second create cannot slip in between (D-123).
      { isolationLevel: 'Serializable' },
    )

  const updateOnce = async (
    id: string,
    input: UpdateTournament,
  ): Promise<UpdateTournamentOutcome> => {
    // Read the counts before the transaction. Under Serializable, MariaDB turns every read into a
    // locking read, and WinForms writes registrations and scores in these tables; a lock here would
    // stall a score keeper. The counts need no lock: a score that lands in the next few
    // milliseconds is the same race as one that lands just after the save.
    const facts = await loadEditFacts(client, id)
    return client.$transaction(
      async (tx) => {
        const row = await tx.tournament.findUnique({ where: { id } })
        if (!row) return { notFound: true as const }
        return applyEdit(
          id,
          {
            stored: {
              name: row.name,
              startDate: isoDate(row.start),
              endDate: isoDate(row.end),
              bowlingCenter: row.bowlingCenter,
              entryFee: row.entryFee.toNumber(),
              games: row.games,
              finalsRatio: row.finalsRatio.toNumber(),
              cashRatio: row.cashRatio.toNumber(),
              superSweeperCashRatio: row.superSweeperCashRatio.toNumber(),
              completed: row.completed,
            },
            facts,
            hasRival: (name, startDate) => hasSameTournament(tx, { name, startDate }, id),
          },
          input,
          async (changes) => {
            await tx.tournament.update({ where: { id }, data: columnsFor(changes) })
          },
        )
      },
      { isolationLevel: 'Serializable' },
    )
  }

  const removeOnce = (
    id: string,
    confirmWarnings: boolean,
    seen: DeleteCounts | undefined,
  ): Promise<DeleteTournamentOutcome> =>
    client.$transaction(
      async (tx) => {
        const row = await tx.tournament.findUnique({ where: { id }, select: { completed: true } })
        if (!row) return { notFound: true as const }
        // Read inside the transaction on purpose (D-135): a score or payment saved after this read
        // must not slip past the refusal. Deletes are rare, so the short lock is fine.
        const facts = await loadDeleteFacts(tx, id, row.completed)
        return applyDelete(
          facts,
          confirmWarnings,
          async () => {
            // These tables have no cascade (database.md, quirk 9): clear them in code, as REG-19
            // does. Payments, divisions, squads, and sweeper pins cascade from the rows below.
            const registrations = { division: { tournamentId: id } }
            await tx.squadRegistration.deleteMany({
              where: { OR: [{ registration: registrations }, { squad: { tournamentId: id } }] },
            })
            await tx.registration.deleteMany({ where: registrations })
            // The payouts table has no foreign key, so nothing cascades (PAY-18, D-280).
            await tx.payout.deleteMany({ where: { tournamentId: id } })
            await tx.tournament.delete({ where: { id } })
          },
          seen,
        )
      },
      { isolationLevel: 'Serializable' },
    )

  return {
    create: (input) => withDatabaseErrors(logger, () => withRetry(() => createOnce(input))),
    update: (id, input) => withDatabaseErrors(logger, () => withRetry(() => updateOnce(id, input))),
    remove: (id, { confirmWarnings, seen }) =>
      withDatabaseErrors(logger, () => withRetry(() => removeOnce(id, confirmWarnings, seen))),
    // Complete and complete-info (TRN-38 to TRN-41, D-256 to D-259).
    ...createTournamentCompleter(client, logger),
  }
}
