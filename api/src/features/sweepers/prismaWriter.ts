import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import { toSessionEditInfo, type SessionNotFound } from '../../shared/sessionEdit.ts'
import { loadSessionEditFacts } from '../../shared/sessionFacts.ts'
import { localDateTime } from '../../shared/sessions.ts'
import type { NewSweeper } from './createRequest.ts'
import { unknownDivisionMessage } from './createPlan.ts'
import { toSweeper } from './sweeperRow.ts'
import type { StoredSweeper } from './updatePlan.ts'
import type { UpdateSweeper } from './updateRequest.ts'
import {
  applyCreate,
  applyUpdate,
  pinRows,
  toCreatedSweeper,
  type CreateSweeperOutcome,
  type SweeperWriter,
  type UpdateSweeperOutcome,
} from './writer.ts'

/** `Squads.SquadType` for a sweeper (a squad is 0). */
const sweeperType = 1

const isoDate = (value: Date) => value.toISOString().slice(0, 10)

/** Prisma's "foreign key constraint failed": a pin row names a division that is gone. */
const foreignKeyFailed = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003'

/** The legacy column holds the center's local time as digits; Prisma reads and writes them as UTC. */
const storedDate = (localDateTime: string) => new Date(`${localDateTime}.000Z`)

/** The `Squads` columns an edit sets. The pins are separate rows. */
function columnsFor(changes: UpdateSweeper) {
  return {
    ...(changes.date !== undefined && { date: storedDate(changes.date) }),
    ...(changes.startingLane !== undefined && { startingLane: changes.startingLane }),
    ...(changes.numberOfLanes !== undefined && { numberOfLanes: changes.numberOfLanes }),
    ...(changes.maxPerPair !== undefined && { maxPerPair: changes.maxPerPair }),
    ...(changes.entryFee !== undefined && { sweeperEntryFee: changes.entryFee }),
    ...(changes.games !== undefined && { games: changes.games }),
    ...(changes.cashRatio !== undefined && { cashRatio: changes.cashRatio }),
  }
}

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

  // The plan checked the divisions on one snapshot. A division deleted before the insert (here or
  // in WinForms) fails the foreign key; it is the same refusal the plan gives, not a 500, and the
  // transaction has already rolled back.
  const createOrRefuse = async (
    tournamentId: string,
    input: NewSweeper,
  ): Promise<CreateSweeperOutcome> => {
    try {
      return await createOnce(tournamentId, input)
    } catch (error) {
      if (foreignKeyFailed(error)) return { refused: { bonusPins: unknownDivisionMessage } }
      throw error
    }
  }

  const updateOnce = async (
    tournamentId: string,
    sweeperId: string,
    changes: UpdateSweeper,
    confirmWarnings: boolean,
  ): Promise<UpdateSweeperOutcome> => {
    // Read the counts before the transaction: under Serializable MariaDB locks every row it
    // reads, and WinForms writes entries and scores in these tables (as the tournament, division,
    // and squad edits do).
    const facts = await loadSessionEditFacts(client, sweeperId)
    return client.$transaction(
      async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id: tournamentId },
          select: { completed: true, start: true, end: true },
        })
        if (!tournament) return { notFound: 'tournament' as const }
        // The tournament in the URL must own the sweeper, and the row must be a sweeper.
        const row = await tx.squad.findFirst({
          where: { id: sweeperId, tournamentId, squadType: sweeperType },
        })
        if (!row) return { notFound: 'session' as const }
        const divisions = await tx.division.findMany({
          where: { tournamentId },
          select: { id: true, name: true, number: true },
        })
        // Only pins of this tournament's divisions count, as the list reads them.
        const pins = await tx.sweeperDivision.findMany({
          where: { sweeperId, division: { tournamentId } },
        })
        const readable = toSweeper(
          row,
          pins.map((pin) => ({
            divisionId: pin.divisionId,
            divisionName: '',
            bonusPinsPerGame: pin.bonusPinsPerGame,
          })),
        )
        if (!readable.success) {
          // The list skips such a row, so no Edit link leads here; a stale page or a typed URL can.
          logger.warn({ sweeperId, tournamentId }, 'Stored sweeper breaks the read shape')
          return {
            refused: {
              session:
                'This sweeper holds values the app cannot read, so it cannot be edited here.',
            },
          }
        }
        const stored: StoredSweeper = {
          date: localDateTime(row.date) ?? '',
          startingLane: row.startingLane,
          numberOfLanes: row.numberOfLanes,
          maxPerPair: row.maxPerPair,
          entryFee: readable.data.entryFee,
          games: readable.data.games,
          cashRatio: readable.data.cashRatio,
          bonusPins: Object.fromEntries(
            pins.flatMap((pin) =>
              pin.bonusPinsPerGame ? [[pin.divisionId, pin.bonusPinsPerGame] as const] : [],
            ),
          ),
        }
        return applyUpdate(
          sweeperId,
          {
            tournament: {
              completed: tournament.completed,
              startDate: isoDate(tournament.start),
              endDate: isoDate(tournament.end),
            },
            complete: row.complete,
            stored,
            facts,
            divisions,
          },
          divisions,
          changes,
          confirmWarnings,
          async (saved) => {
            const columns = columnsFor(saved)
            if (Object.keys(columns).length > 0) {
              await tx.squad.update({ where: { id: sweeperId }, data: columns })
            }
            // A pin of 0 has no row (D-176); a row with a NULL or 0 is overwritten or removed.
            for (const [divisionId, bonusPinsPerGame] of Object.entries(saved.bonusPins ?? {})) {
              if (bonusPinsPerGame === 0) {
                await tx.sweeperDivision.deleteMany({ where: { sweeperId, divisionId } })
              } else {
                await tx.sweeperDivision.upsert({
                  where: { sweeperId_divisionId: { sweeperId, divisionId } },
                  create: { sweeperId, divisionId, bonusPinsPerGame },
                  update: { bonusPinsPerGame },
                })
              }
            }
          },
        )
      },
      // Two edits of one sweeper must not interleave (D-184).
      { isolationLevel: 'Serializable' },
    )
  }

  // A division deleted between the read and a pin write fails the foreign key: the same refusal the
  // plan gives (D-177), and the transaction has rolled back.
  const updateOrRefuse = async (
    tournamentId: string,
    sweeperId: string,
    changes: UpdateSweeper,
    confirmWarnings: boolean,
  ): Promise<UpdateSweeperOutcome> => {
    try {
      return await withRetry(() => updateOnce(tournamentId, sweeperId, changes, confirmWarnings))
    } catch (error) {
      if (foreignKeyFailed(error)) return { refused: { bonusPins: unknownDivisionMessage } }
      throw error
    }
  }

  return {
    create: (tournamentId, input) =>
      withDatabaseErrors(logger, () => createOrRefuse(tournamentId, input)),
    update: (tournamentId, sweeperId, changes, { confirmWarnings }) =>
      withDatabaseErrors(logger, () =>
        updateOrRefuse(tournamentId, sweeperId, changes, confirmWarnings),
      ),
    getEditInfo: (tournamentId, sweeperId) =>
      withDatabaseErrors(logger, async () => {
        const tournament = await client.tournament.findUnique({
          where: { id: tournamentId },
          select: { id: true },
        })
        if (!tournament) return { notFound: 'tournament' as const } satisfies SessionNotFound
        const row = await client.squad.findFirst({
          where: { id: sweeperId, tournamentId, squadType: sweeperType },
          select: { id: true },
        })
        if (!row) return { notFound: 'session' as const } satisfies SessionNotFound
        return toSessionEditInfo(await loadSessionEditFacts(client, sweeperId))
      }),
  }
}
