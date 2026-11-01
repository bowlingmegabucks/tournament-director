import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import type { BowlerData, BowlerPatch, Gender, StoredBowler } from './bowler.ts'
import type { RegistrationWriter, StoredSession } from './writer.ts'

const squadType = 0
const sweeperType = 1

/** The columns of a `Bowlers` row that the writer reads. The SSN is never among them (BWL-17). */
export interface BowlerRow {
  id: string
  firstName: string
  middleInitial: string
  lastName: string
  suffix: string
  street: string
  city: string
  state: string
  zipCode: string
  email: string
  phoneNumber: string
  usbcId: string
  dateOfBirth: Date | null
  gender: number | null
}

// database.md: 0 is Male, 1 is Female, NULL is unknown. Any other value reads as unknown.
export function genderFromColumn(value: number | null): Gender | null {
  if (value === 0) return 'Male'
  return value === 1 ? 'Female' : null
}

function genderToColumn(gender: Gender | null): number | null {
  if (gender === null) return null
  return gender === 'Male' ? 0 : 1
}

// A stored date is midnight with no zone; Prisma reads it as UTC, so the digits are the stored ones.
function dateOnly(value: Date | null): string | null {
  return value === null || Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
}

export function toStoredBowler(row: BowlerRow): StoredBowler {
  return {
    id: row.id,
    firstName: row.firstName,
    middleInitial: row.middleInitial,
    lastName: row.lastName,
    suffix: row.suffix,
    street: row.street,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    email: row.email,
    phoneNumber: row.phoneNumber,
    usbcId: row.usbcId,
    dateOfBirth: dateOnly(row.dateOfBirth),
    gender: genderFromColumn(row.gender),
  }
}

function dateColumn(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00Z`)
}

/** Only the columns the patch names. `undefined` leaves a column alone in Prisma (D-05). */
function patchColumns(patch: BowlerPatch) {
  return {
    firstName: patch.firstName,
    middleInitial: patch.middleInitial,
    lastName: patch.lastName,
    suffix: patch.suffix,
    street: patch.street,
    city: patch.city,
    state: patch.state,
    zipCode: patch.zipCode,
    email: patch.email,
    phoneNumber: patch.phoneNumber,
    usbcId: patch.usbcId,
    dateOfBirth: patch.dateOfBirth === undefined ? undefined : dateColumn(patch.dateOfBirth),
    gender: patch.gender === undefined ? undefined : genderToColumn(patch.gender),
  }
}

function newColumns(data: BowlerData) {
  return {
    firstName: data.firstName,
    middleInitial: data.middleInitial,
    lastName: data.lastName,
    suffix: data.suffix,
    street: data.street,
    city: data.city,
    state: data.state,
    zipCode: data.zipCode,
    email: data.email,
    phoneNumber: data.phoneNumber,
    usbcId: data.usbcId,
    dateOfBirth: dateColumn(data.dateOfBirth),
    gender: genderToColumn(data.gender),
  }
}

function toSession(row: {
  id: string
  tournamentId: string
  squadType: number
  complete: boolean
}): StoredSession[] {
  if (row.squadType !== squadType && row.squadType !== sweeperType) return []
  const kind = row.squadType === squadType ? 'squad' : 'sweeper'
  return [{ id: row.id, tournamentId: row.tournamentId, kind, complete: row.complete }]
}

/**
 * Writes registrations to the legacy `Bowlers`, `Registrations`, `SquadRegistration`, and
 * `Payments` tables (API-05). One save is one transaction, so a failure leaves nothing behind.
 * The tournament of a registration comes from its division (Q-26).
 */
export function createPrismaRegistrationWriter(
  client: PrismaClient,
  logger: Logger,
): RegistrationWriter {
  return {
    async findBowlersByUsbcId(usbcId) {
      const rows = await withDatabaseErrors(logger, () =>
        client.bowler.findMany({ where: { usbcId }, orderBy: { id: 'asc' } }),
      )
      return rows.map(toStoredBowler)
    },

    async findRegistration(bowlerId, tournamentId) {
      const row = await withDatabaseErrors(logger, () =>
        client.registration.findFirst({
          where: { bowlerId, division: { tournamentId } },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            bowlerId: true,
            divisionId: true,
            average: true,
            superSweeper: true,
            squads: { select: { squadId: true } },
          },
        }),
      )
      if (!row) return undefined
      const { squads, ...rest } = row
      return { ...rest, sessionIds: squads.map((entry) => entry.squadId) }
    },

    async findDivisionTournament(divisionId) {
      const row = await withDatabaseErrors(logger, () =>
        client.division.findUnique({ where: { id: divisionId }, select: { tournamentId: true } }),
      )
      return row?.tournamentId
    },

    async findSessions(ids) {
      if (ids.length === 0) return []
      const rows = await withDatabaseErrors(logger, () =>
        client.squad.findMany({
          where: { id: { in: ids } },
          select: { id: true, tournamentId: true, squadType: true, complete: true },
        }),
      )
      return rows.flatMap(toSession)
    },

    async findRegistrationIdByPaymentCode(confirmationCode) {
      const row = await withDatabaseErrors(logger, () =>
        client.payment.findUnique({
          where: { confirmationCode },
          select: { registrationId: true },
        }),
      )
      return row?.registrationId
    },

    async save({ bowler, registration, addSessionIds, payment }) {
      await withDatabaseErrors(logger, () =>
        client.$transaction(async (tx) => {
          if (bowler.isNew) {
            await tx.bowler.create({ data: { id: bowler.id, ...newColumns(bowler.data) } })
          } else if (Object.keys(bowler.patch).length > 0) {
            await tx.bowler.update({ where: { id: bowler.id }, data: patchColumns(bowler.patch) })
          }

          const columns = {
            divisionId: registration.divisionId,
            average: registration.average,
            superSweeper: registration.superSweeper,
          }
          if (registration.isNew) {
            await tx.registration.create({
              data: { id: registration.id, bowlerId: bowler.id, ...columns },
            })
          } else {
            await tx.registration.update({ where: { id: registration.id }, data: columns })
          }

          if (addSessionIds.length > 0) {
            await tx.squadRegistration.createMany({
              data: addSessionIds.map((squadId) => ({
                registrationId: registration.id,
                squadId,
                laneAssignment: '',
              })),
            })
          }
          if (payment) {
            await tx.payment.create({
              data: {
                id: payment.id,
                registrationId: registration.id,
                confirmationCode: payment.confirmationCode,
                amount: payment.amount,
                createdAtUtc: payment.createdAtUtc,
              },
            })
          }
        }),
      )
    },

    async getDetail(registrationId) {
      const row = await withDatabaseErrors(logger, () =>
        client.registration.findUnique({
          where: { id: registrationId },
          select: {
            id: true,
            bowlerId: true,
            divisionId: true,
            average: true,
            superSweeper: true,
            division: { select: { tournamentId: true } },
            bowler: true,
            squads: { select: { squadId: true } },
          },
        }),
      )
      if (!row) return undefined
      return {
        id: row.id,
        bowlerId: row.bowlerId,
        divisionId: row.divisionId,
        average: row.average,
        superSweeper: row.superSweeper,
        tournamentId: row.division.tournamentId,
        bowler: toStoredBowler(row.bowler),
        sessionIds: row.squads.map((entry) => entry.squadId),
      }
    },
  }
}
