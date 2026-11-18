import type { Logger } from '../../shared/logger.ts'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { displayName } from '../registrations/registrationRow.ts'
import { HttpError } from '../../shared/errors.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import { averageInUse, averageStatus, liveCheck, type AverageCheck } from './inUse.ts'
import type { AverageListing, AverageStore, CheckReading, SavedAgainst } from './store.ts'
import type { AverageRow } from './types.ts'

/** Sort as the registrations list does (REG-23): last name, first name, then id. */
function byName(
  a: { last: string; first: string; id: string },
  b: { last: string; first: string; id: string },
): number {
  const text = (x: string, y: string) => x.localeCompare(y, 'en', { sensitivity: 'base' })
  return text(a.last, b.last) || text(a.first, b.first) || text(a.id, b.id)
}

/** The average checks in the `AverageVerifications` table (D-287). */
export function createPrismaAverageStore(client: PrismaClient, logger: Logger): AverageStore {
  return {
    async list(tournamentId): Promise<AverageListing | undefined> {
      return withDatabaseErrors(logger, async () => {
        const tournament = await client.tournament.findUnique({
          where: { id: tournamentId },
          select: { completed: true },
        })
        if (!tournament) return undefined
        const divisions = await client.division.findMany({
          where: { tournamentId, handicapPercentage: { not: null } },
          select: { id: true, name: true },
        })
        const divisionName = new Map(divisions.map((division) => [division.id, division.name]))
        const registrations =
          divisions.length === 0
            ? []
            : await client.registration.findMany({
                where: { divisionId: { in: [...divisionName.keys()] } },
                select: {
                  id: true,
                  average: true,
                  divisionId: true,
                  bowler: {
                    select: { firstName: true, lastName: true, suffix: true, usbcId: true },
                  },
                },
              })
        const checks =
          registrations.length === 0
            ? []
            : await client.averageVerification.findMany({
                where: { registrationId: { in: registrations.map((item) => item.id) } },
              })
        const checkOf = new Map(checks.map((check) => [check.registrationId, check]))
        const userIds = [...new Set(checks.map((check) => check.verifiedBy))]
        const users =
          userIds.length === 0
            ? []
            : await client.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true },
              })
        const userName = new Map(users.map((user) => [user.id, user.name]))

        const rows = registrations
          .toSorted((a, b) =>
            byName(
              { last: a.bowler.lastName, first: a.bowler.firstName, id: a.id },
              { last: b.bowler.lastName, first: b.bowler.firstName, id: b.id },
            ),
          )
          .map((item): AverageRow => {
            const check = liveCheck(item.average, checkOf.get(item.id))
            return {
              registrationId: item.id,
              bowlerName: displayName(item.bowler),
              divisionName: divisionName.get(item.divisionId) ?? '',
              usbcId: item.bowler.usbcId,
              providedAverage: check ? check.providedAverage : item.average,
              status: averageStatus(check),
              averageInUse: averageInUse(item.average, check),
              note: check?.note ?? null,
              verifiedBy: check ? (userName.get(check.verifiedBy) ?? null) : null,
              verifiedAt: check ? check.verifiedAt.toISOString() : null,
            }
          })
        return { tournamentComplete: tournament.completed, rows }
      })
    },

    read: (tournamentId, registrationId) =>
      withDatabaseErrors(logger, () => readCheck(client, tournamentId, registrationId)),

    async save(registrationId, check, actorId, against) {
      const data = {
        providedAverage: check.providedAverage,
        verifiedAverage: check.verifiedAverage,
        note: check.note,
        verifiedBy: actorId,
        verifiedAt: new Date(),
      }
      const write = (db: Db) =>
        db.averageVerification.upsert({
          where: { registrationId },
          create: { registrationId, ...data },
          update: data,
        })
      await withDatabaseErrors(logger, () => guarded(client, registrationId, against, write))
    },

    async remove(registrationId, against) {
      await withDatabaseErrors(logger, () =>
        guarded(client, registrationId, against, (db) =>
          db.averageVerification.deleteMany({ where: { registrationId } }),
        ),
      )
    },
  }
}

/** What the reads and the guarded writes use: the client, or the client inside a transaction. */
type Db = Pick<
  PrismaClient,
  'registration' | 'tournament' | 'averageVerification' | 'squadScore' | 'squad'
>

const changedMessage = 'This registration changed. Reload the page and check it again.'

/** What a plan was made from; two readings with the same stamp would make the same plan. */
function stampOf(reading: CheckReading): string {
  return JSON.stringify([
    reading.tournamentComplete,
    reading.handicap,
    reading.providedAverage,
    reading.minimumAverage,
    reading.maximumAverage,
    reading.scored,
    reading.existing ?? null,
  ])
}

/**
 * Write only if what the plan read still holds (D-130, D-294). The read is made again inside a
 * serializable transaction with the write, so a tournament completed, a score saved, or another
 * director's check landing in between turns this save into a `409` and not a stale write.
 */
async function guarded(
  client: PrismaClient,
  registrationId: string,
  against: SavedAgainst | undefined,
  write: (db: Db) => Promise<unknown>,
): Promise<void> {
  if (against === undefined) {
    await write(client)
    return
  }
  await withRetry(() =>
    client.$transaction(
      async (tx) => {
        const now = await readCheck(tx, against.tournamentId, registrationId)
        if (!now || stampOf(now) !== stampOf(against.reading))
          throw new HttpError(409, changedMessage)
        await write(tx)
      },
      { isolationLevel: 'Serializable' },
    ),
  )
}

async function readCheck(
  db: Db,
  tournamentId: string,
  registrationId: string,
): Promise<CheckReading | undefined> {
  const row = await db.registration.findUnique({
    where: { id: registrationId },
    select: {
      average: true,
      bowlerId: true,
      bowler: { select: { firstName: true, lastName: true, suffix: true } },
      division: {
        select: {
          tournamentId: true,
          handicapPercentage: true,
          minimumAverage: true,
          maximumAverage: true,
        },
      },
      squads: { select: { squadId: true } },
    },
  })
  if (row?.division.tournamentId !== tournamentId) return undefined
  const [tournament, existing, scoredIds] = await Promise.all([
    db.tournament.findUnique({ where: { id: tournamentId }, select: { completed: true } }),
    db.averageVerification.findUnique({ where: { registrationId } }),
    db.squadScore.findMany({
      where: { bowlerId: row.bowlerId },
      distinct: ['squadId'],
      select: { squadId: true },
    }),
  ])
  if (!tournament) return undefined
  // A bowler record outlives a tournament, so only the sessions of this one count.
  const scored =
    scoredIds.length === 0
      ? []
      : await db.squad.findMany({
          where: { id: { in: scoredIds.map((score) => score.squadId) }, tournamentId },
          select: { complete: true },
        })
  return {
    bowlerName: displayName(row.bowler),
    tournamentComplete: tournament.completed,
    handicap: row.division.handicapPercentage !== null,
    providedAverage: row.average,
    minimumAverage: row.division.minimumAverage,
    maximumAverage: row.division.maximumAverage,
    scored,
    existing: liveCheck(row.average, existing ? toCheck(existing) : undefined),
    sessionIds: row.squads.map((entry) => entry.squadId),
  }
}

function toCheck(row: {
  providedAverage: number | null
  verifiedAverage: number
  note: string | null
}): AverageCheck {
  return {
    providedAverage: row.providedAverage,
    verifiedAverage: row.verifiedAverage,
    note: row.note,
  }
}
