import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { newColumns, patchColumns, toStoredBowler } from './bowlerRow.ts'
import { afterVendorAverage, liveCheck } from '../averages/inUse.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import { loadDeskDeleteFacts } from './prismaDeskDelete.ts'
import { StaleRegistrationError, type RegistrationWriter, type StoredSession } from './writer.ts'

const squadType = 0
const sweeperType = 1

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

type Tx = Parameters<
  Parameters<PrismaClient['$transaction']>[0] extends infer F
    ? F extends (tx: infer T) => unknown
      ? (tx: T) => unknown
      : never
    : never
>[0]
type Save = Parameters<RegistrationWriter['save']>[0]

/** D-199: the desk read the registration earlier; check it still reads the same. */
async function checkExpected(
  tx: Tx,
  registrationId: string,
  expect: { present: string[]; absent: string[] },
): Promise<void> {
  const rows = await tx.squadRegistration.findMany({
    where: { registrationId, squadId: { in: [...expect.present, ...expect.absent] } },
    select: { squadId: true },
  })
  const held = new Set(rows.map((row) => row.squadId))
  if (!expect.present.every((id) => held.has(id)) || expect.absent.some((id) => held.has(id))) {
    throw new StaleRegistrationError()
  }
}

async function writeBowler(tx: Tx, bowler: Save['bowler']): Promise<void> {
  if (bowler.isNew) {
    await tx.bowler.create({ data: { id: bowler.id, ...newColumns(bowler.data) } })
  } else if (Object.keys(bowler.patch).length > 0) {
    await tx.bowler.update({ where: { id: bowler.id }, data: patchColumns(bowler.patch) })
  }
}

async function writeRegistration(
  tx: Tx,
  bowlerId: string,
  registration: Save['registration'],
): Promise<void> {
  const columns = {
    divisionId: registration.divisionId,
    average: registration.average,
    superSweeper: registration.superSweeper,
    // Undefined leaves the column alone (and false on a create): SMT-01.
    smartScholarship: registration.smartScholarship,
  }
  if (registration.isNew) {
    await tx.registration.create({ data: { id: registration.id, bowlerId, ...columns } })
    return
  }
  // D-299 keeps a check only while it counts: it must still match the stored average
  // (a WinForms write breaks that, AVG-08), so read the old average before the update.
  const before =
    registration.keepAverageCheckAs === undefined
      ? null
      : await tx.registration.findUnique({
          where: { id: registration.id },
          select: { average: true },
        })
  await tx.registration.update({ where: { id: registration.id }, data: columns })
  if (registration.clearAverageCheck) {
    await tx.averageVerification.deleteMany({ where: { registrationId: registration.id } })
  } else if (registration.keepAverageCheckAs !== undefined && before) {
    await keepCheck(tx, registration.id, before.average, registration.keepAverageCheckAs)
  }
}

async function keepCheck(
  tx: Tx,
  registrationId: string,
  storedAverage: number | null,
  keepAs: Parameters<typeof afterVendorAverage>[1],
): Promise<void> {
  const check = await tx.averageVerification.findUnique({ where: { registrationId } })
  if (!check || !liveCheck(storedAverage, check)) return
  const { providedAverage, note } = afterVendorAverage(check, keepAs)
  await tx.averageVerification.update({
    where: { registrationId },
    data: { providedAverage, note },
  })
}

async function writeSessions(
  tx: Tx,
  registrationId: string,
  addSessionIds: string[],
  removeSessionIds: string[],
): Promise<void> {
  if (removeSessionIds.length > 0) {
    await tx.squadRegistration.deleteMany({
      where: { registrationId, squadId: { in: removeSessionIds } },
    })
  }
  if (addSessionIds.length > 0) {
    await tx.squadRegistration.createMany({
      data: addSessionIds.map((squadId) => ({ registrationId, squadId, laneAssignment: '' })),
    })
  }
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

    async findBowlerById(id) {
      const row = await withDatabaseErrors(logger, () =>
        client.bowler.findUnique({ where: { id } }),
      )
      return row ? toStoredBowler(row) : undefined
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
            smartScholarship: true,
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

    async hasPaidPayout(registrationId) {
      const count = await withDatabaseErrors(logger, () =>
        client.payout.count({ where: { registrationId, paid: true } }),
      )
      return count > 0
    },

    async findScoredSessionIds(bowlerId) {
      const rows = await withDatabaseErrors(logger, () =>
        client.squadScore.findMany({
          where: { bowlerId },
          distinct: ['squadId'],
          select: { squadId: true },
        }),
      )
      return rows.map((row) => row.squadId)
    },

    async save({ bowler, registration, addSessionIds, removeSessionIds = [], payment, expect }) {
      const run = () =>
        client.$transaction(
          async (tx) => {
            if (expect) await checkExpected(tx, registration.id, expect)
            await writeBowler(tx, bowler)
            await writeRegistration(tx, bowler.id, registration)
            await writeSessions(tx, registration.id, addSessionIds, removeSessionIds)
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
          },
          // Two desk edits of one registration must not interleave (D-199).
          expect ? { isolationLevel: 'Serializable' } : undefined,
        )
      await withDatabaseErrors(logger, () => (expect ? withRetry(run) : run()))
    },

    async deleteRegistration(registrationId) {
      await withDatabaseErrors(logger, () =>
        client.$transaction([
          client.payment.deleteMany({ where: { registrationId } }),
          client.squadRegistration.deleteMany({ where: { registrationId } }),
          // The check table has no foreign key (D-287), so clear it in code.
          client.averageVerification.deleteMany({ where: { registrationId } }),
          client.registration.delete({ where: { id: registrationId } }),
        ]),
      )
    },

    async getDeskDeleteFacts(registrationId, tournamentId) {
      return withDatabaseErrors(logger, () =>
        loadDeskDeleteFacts(client, registrationId, tournamentId),
      )
    },

    async removeForDesk(registrationId, tournamentId, decide) {
      const run = () =>
        client.$transaction(
          async (tx) => {
            // Read inside the transaction on purpose (D-211): a score or payment saved after this
            // read must not slip past the refusal or the warning.
            const facts = await loadDeskDeleteFacts(tx, registrationId, tournamentId)
            if (!facts) return undefined
            const plan = decide(facts)
            if (plan.kind === 'delete') {
              // No cascade on `SquadRegistration` (database.md, quirk 9), so clear it in code.
              await tx.squadRegistration.deleteMany({ where: { registrationId } })
              await tx.payment.deleteMany({ where: { registrationId } })
              // The check table has no foreign key (D-287), so clear it in code.
              await tx.averageVerification.deleteMany({ where: { registrationId } })
              await tx.registration.delete({ where: { id: registrationId } })
            }
            return plan
          },
          { isolationLevel: 'Serializable' },
        )
      return withDatabaseErrors(logger, () => withRetry(run))
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
            smartScholarship: true,
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
        smartScholarship: row.smartScholarship,
        tournamentId: row.division.tournamentId,
        bowler: toStoredBowler(row.bowler),
        sessionIds: row.squads.map((entry) => entry.squadId),
      }
    },
  }
}
