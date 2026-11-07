import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import { toSessionEditInfo, type SessionNotFound } from '../../shared/sessionEdit.ts'
import { loadSessionEditFacts } from '../../shared/sessionFacts.ts'
import { localDateTime } from '../../shared/sessions.ts'
import type { NewSquad } from './createRequest.ts'
import { toSquad } from './squadRow.ts'
import type { StoredSquad } from './updatePlan.ts'
import type { UpdateSquad } from './updateRequest.ts'
import {
  applyCreate,
  applyUpdate,
  toCreatedSquad,
  type CreateSquadOutcome,
  type SquadWriter,
  type UpdateSquadOutcome,
} from './writer.ts'

/** `Squads.SquadType` for a qualifying squad (a sweeper is 1). */
const squadType = 0

const isoDate = (value: Date) => value.toISOString().slice(0, 10)

/** The legacy column holds the center's local time as digits; Prisma reads and writes them as UTC. */
const storedDate = (localDateTime: string) => new Date(`${localDateTime}.000Z`)

/** The columns an edit sets. A `null` fee or ratio clears the override (D-183). */
function columnsFor(changes: UpdateSquad) {
  return {
    ...(changes.date !== undefined && { date: storedDate(changes.date) }),
    ...(changes.startingLane !== undefined && { startingLane: changes.startingLane }),
    ...(changes.numberOfLanes !== undefined && { numberOfLanes: changes.numberOfLanes }),
    ...(changes.maxPerPair !== undefined && { maxPerPair: changes.maxPerPair }),
    ...(changes.entryFee !== undefined && { squadEntryFee: changes.entryFee }),
    ...(changes.finalsRatio !== undefined && { finalsRatio: changes.finalsRatio }),
    ...(changes.cashRatio !== undefined && { cashRatio: changes.cashRatio }),
  }
}

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

  const updateOnce = async (
    tournamentId: string,
    squadId: string,
    changes: UpdateSquad,
    confirmWarnings: boolean,
  ): Promise<UpdateSquadOutcome> => {
    // Read the counts before the transaction. Under Serializable, MariaDB turns every read into a
    // locking read, and WinForms writes entries and scores in these tables; a lock here would
    // stall a score keeper. A score that lands in the next few milliseconds is the same race as
    // one that lands just after the save (the tournament and division edits do the same).
    const facts = await loadSessionEditFacts(client, squadId)
    return client.$transaction(
      async (tx) => {
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
        if (!tournament) return { notFound: 'tournament' as const }
        // The tournament in the URL must own the squad, and the row must be a squad.
        const row = await tx.squad.findFirst({ where: { id: squadId, tournamentId, squadType } })
        if (!row) return { notFound: 'session' as const }
        const defaults = {
          entryFee: tournament.entryFee.toNumber(),
          finalsRatio: tournament.finalsRatio.toNumber(),
          cashRatio: tournament.cashRatio.toNumber(),
          games: tournament.games,
        }
        const readable = toSquad(row, defaults)
        if (!readable.success) {
          // The list skips such a row, so no Edit link leads here; a stale page or a typed URL can.
          logger.warn({ squadId, tournamentId }, 'Stored squad breaks the read shape')
          return {
            refused: {
              session: 'This squad holds values the app cannot read, so it cannot be edited here.',
            },
          }
        }
        const stored: StoredSquad = {
          date: localDateTime(row.date) ?? '',
          startingLane: row.startingLane,
          numberOfLanes: row.numberOfLanes,
          maxPerPair: row.maxPerPair,
          entryFee: row.squadEntryFee === null ? null : row.squadEntryFee.toNumber(),
          finalsRatio: row.finalsRatio === null ? null : row.finalsRatio.toNumber(),
          cashRatio: row.cashRatio === null ? null : row.cashRatio.toNumber(),
        }
        return applyUpdate(
          squadId,
          {
            tournament: {
              completed: tournament.completed,
              startDate: isoDate(tournament.start),
              endDate: isoDate(tournament.end),
            },
            complete: row.complete,
            stored,
            facts,
          },
          defaults,
          changes,
          confirmWarnings,
          async (saved) => {
            await tx.squad.update({ where: { id: squadId }, data: columnsFor(saved) })
          },
        )
      },
      // Two edits of one squad must not interleave (D-184).
      { isolationLevel: 'Serializable' },
    )
  }

  return {
    create: (tournamentId, input) =>
      withDatabaseErrors(logger, () => createOnce(tournamentId, input)),
    update: (tournamentId, squadId, changes, { confirmWarnings }) =>
      withDatabaseErrors(logger, () =>
        withRetry(() => updateOnce(tournamentId, squadId, changes, confirmWarnings)),
      ),
    getEditInfo: (tournamentId, squadId) =>
      withDatabaseErrors(logger, async () => {
        const tournament = await client.tournament.findUnique({
          where: { id: tournamentId },
          select: { id: true },
        })
        if (!tournament) return { notFound: 'tournament' as const } satisfies SessionNotFound
        const row = await client.squad.findFirst({
          where: { id: squadId, tournamentId, squadType },
          select: { id: true },
        })
        if (!row) return { notFound: 'session' as const } satisfies SessionNotFound
        return toSessionEditInfo(await loadSessionEditFacts(client, squadId))
      }),
  }
}
