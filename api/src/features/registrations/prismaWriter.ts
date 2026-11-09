import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { newColumns, patchColumns, toStoredBowler } from './bowlerRow.ts'
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
            if (expect) {
              // D-199: the desk read the registration earlier; check it still reads the same.
              const rows = await tx.squadRegistration.findMany({
                where: {
                  registrationId: registration.id,
                  squadId: { in: [...expect.present, ...expect.absent] },
                },
                select: { squadId: true },
              })
              const held = new Set(rows.map((row) => row.squadId))
              if (
                !expect.present.every((id) => held.has(id)) ||
                expect.absent.some((id) => held.has(id))
              ) {
                throw new StaleRegistrationError()
              }
            }
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

            if (removeSessionIds.length > 0) {
              await tx.squadRegistration.deleteMany({
                where: { registrationId: registration.id, squadId: { in: removeSessionIds } },
              })
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
