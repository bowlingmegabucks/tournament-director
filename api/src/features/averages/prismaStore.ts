import type { Logger } from '../../shared/logger.ts'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import { displayName } from '../registrations/registrationRow.ts'
import { averageInUse, averageStatus } from './inUse.ts'
import type { AverageListing, AverageStore, CheckReading } from './store.ts'
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
            const check = checkOf.get(item.id)
            return {
              registrationId: item.id,
              bowlerName: displayName(item.bowler),
              divisionName: divisionName.get(item.divisionId) ?? '',
              usbcId: item.bowler.usbcId,
              providedAverage: check ? check.providedAverage : item.average,
              status: averageStatus(check),
              averageInUse: averageInUse(item.average, check && toCheck(check)),
              note: check?.note ?? null,
              verifiedBy: check ? (userName.get(check.verifiedBy) ?? null) : null,
              verifiedAt: check ? check.verifiedAt.toISOString() : null,
            }
          })
        return { tournamentComplete: tournament.completed, rows }
      })
    },

    async read(tournamentId, registrationId): Promise<CheckReading | undefined> {
      return withDatabaseErrors(logger, async () => {
        const row = await client.registration.findUnique({
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
        const tournament = await client.tournament.findUnique({
          where: { id: tournamentId },
          select: { completed: true },
        })
        if (!tournament) return undefined
        const existing = await client.averageVerification.findUnique({ where: { registrationId } })
        // A bowler record outlives a tournament, so only the sessions of this one count.
        const scoredIds = (
          await client.squadScore.findMany({
            where: { bowlerId: row.bowlerId },
            distinct: ['squadId'],
            select: { squadId: true },
          })
        ).map((score) => score.squadId)
        const scored =
          scoredIds.length === 0
            ? []
            : await client.squad.findMany({
                where: { id: { in: scoredIds }, tournamentId },
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
          existing: existing ? toCheck(existing) : undefined,
          sessionIds: row.squads.map((entry) => entry.squadId),
        }
      })
    },

    async save(registrationId, check, actorId) {
      const data = {
        providedAverage: check.providedAverage,
        verifiedAverage: check.verifiedAverage,
        note: check.note,
        verifiedBy: actorId,
        verifiedAt: new Date(),
      }
      await withDatabaseErrors(logger, () =>
        client.averageVerification.upsert({
          where: { registrationId },
          create: { registrationId, ...data },
          update: data,
        }),
      )
    },

    async remove(registrationId) {
      await withDatabaseErrors(logger, () =>
        client.averageVerification.deleteMany({ where: { registrationId } }),
      )
    },
  }
}

function toCheck(row: {
  providedAverage: number | null
  verifiedAverage: number
  note: string | null
}) {
  return {
    providedAverage: row.providedAverage,
    verifiedAverage: row.verifiedAverage,
    note: row.note,
  }
}
