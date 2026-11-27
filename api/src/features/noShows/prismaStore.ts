import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import { isRealPayment } from '../registrations/payment.ts'
import type { NoShowCommand, NoShowStore } from './store.ts'

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/** `Squads.SquadType`: a squad is 0. */
const SQUAD = 0

/** NSH-02 to NSH-04: the tournament, both squads, and the entry still read as the preview did. */
async function sessionsHold(tx: Tx, command: NoShowCommand): Promise<boolean> {
  const { tournamentId, sourceSquadId, targetSquadId, registrationId } = command
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    select: { completed: true },
  })
  if (tournament?.completed !== false) return false
  const where = { tournamentId, squadType: SQUAD }
  const source = await tx.squad.findFirst({
    where: { ...where, id: sourceSquadId, complete: true },
    select: { id: true },
  })
  if (!source) return false
  const held = new Set(
    (
      await tx.squadRegistration.findMany({
        where: { registrationId },
        select: { squadId: true },
      })
    ).map((row) => row.squadId),
  )
  if (!held.has(sourceSquadId)) return false
  if (targetSquadId === null) return true
  const target = await tx.squad.findFirst({
    where: { ...where, id: targetSquadId, complete: false },
    select: { id: true },
  })
  return target !== null && !held.has(targetSquadId)
}

/** NSH-06: a refund that keeps the registration leaves it at least one other squad entry. */
async function hasOtherSquad(tx: Tx, command: NoShowCommand): Promise<boolean> {
  const rows = await tx.squadRegistration.findMany({
    where: { registrationId: command.registrationId, squadId: { not: command.sourceSquadId } },
    select: { squad: { select: { squadType: true } } },
  })
  return rows.some((row) => row.squad.squadType === SQUAD)
}

/** NSH-06, D-211: the payments a delete removes are still the ones the admin was warned about. */
async function paymentsHold(tx: Tx, command: NoShowCommand): Promise<boolean> {
  const rows = await tx.payment.findMany({
    where: { registrationId: command.registrationId },
    select: { confirmationCode: true, amount: true },
  })
  const paid = rows
    .map((row) => ({ code: row.confirmationCode, amount: row.amount.toNumber() }))
    .filter((payment) => isRealPayment(payment.code, payment.amount))
    .reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0)
  return paid === command.paidCents
}

/** NSH-03, NSH-07, NSH-08: still a no-show, and nothing that blocks the write has appeared. */
async function bowlerHolds(tx: Tx, command: NoShowCommand): Promise<boolean> {
  const { tournamentId, sourceSquadId, registrationId, bowlerId, deleteRegistration } = command
  const scored = await tx.squadScore.findFirst({
    where: { bowlerId, squadId: sourceSquadId, score: { gt: 0 } },
    select: { game: true },
  })
  if (scored) return false
  const payout = await tx.payout.findFirst({
    where: {
      tournamentId,
      registrationId,
      ...(deleteRegistration ? {} : { source: 'squad', eventId: sourceSquadId }),
    },
    select: { id: true },
  })
  if (payout) return false
  // A move keeps the registration and adds an entry.
  if (command.targetSquadId !== null) return true
  // The plan deletes exactly when no other squad entry is left.
  if ((await hasOtherSquad(tx, command)) === deleteRegistration) return false
  if (!deleteRegistration) return true
  if (!(await paymentsHold(tx, command))) return false
  const sessions = await tx.squad.findMany({
    where: { tournamentId, id: { not: sourceSquadId } },
    select: { id: true },
  })
  const other = await tx.squadScore.findFirst({
    where: { bowlerId, squadId: { in: sessions.map((session) => session.id) } },
    select: { game: true },
  })
  return other === null
}

/** Every payout that gets a note still has none (NSH-11). */
async function notesHold(tx: Tx, command: NoShowCommand): Promise<boolean> {
  if (command.notes.length === 0) return true
  const rows = await tx.payout.findMany({
    where: {
      tournamentId: command.tournamentId,
      id: { in: command.notes.map((item) => item.payoutId) },
    },
    select: { note: true },
  })
  return rows.length === command.notes.length && rows.every((row) => !row.note)
}

async function write(tx: Tx, command: NoShowCommand): Promise<void> {
  const { sourceSquadId, targetSquadId, registrationId, bowlerId, actorId } = command
  await tx.squadScore.deleteMany({ where: { bowlerId, squadId: sourceSquadId } })
  await tx.sessionDnf.deleteMany({ where: { sessionId: sourceSquadId, registrationId } })
  if (command.deleteRegistration) {
    // No cascade on `SquadRegistration`, and the check table has no foreign key (D-287).
    await tx.squadRegistration.deleteMany({ where: { registrationId } })
    await tx.payment.deleteMany({ where: { registrationId } })
    await tx.averageVerification.deleteMany({ where: { registrationId } })
    await tx.registration.delete({ where: { id: registrationId } })
  } else {
    await tx.squadRegistration.deleteMany({ where: { registrationId, squadId: sourceSquadId } })
    if (targetSquadId !== null) {
      await tx.squadRegistration.create({
        data: { registrationId, squadId: targetSquadId, laneAssignment: '' },
      })
    }
  }
  for (const key of command.keepAdvancing) {
    const where = { registrationId: key.registrationId, squadId: key.squadId }
    const data = { forcedAdvancer: true }
    await tx.squadRegistration.updateMany({ where, data }) // NOSONAR: one connection
  }
  const now = new Date()
  for (const { payoutId, note } of command.notes) {
    const data = { note, updatedAt: now, updatedBy: actorId }
    await tx.payout.update({ where: { id: payoutId }, data }) // NOSONAR: one connection
  }
}

/** One serializable transaction, so a score or payout saved since the preview is seen. */
export function createPrismaNoShowStore(client: PrismaClient, logger: Logger): NoShowStore {
  return {
    apply: (command) =>
      withDatabaseErrors(logger, () =>
        withRetry(() =>
          client.$transaction(
            async (tx) => {
              const holds =
                (await sessionsHold(tx, command)) &&
                (await bowlerHolds(tx, command)) &&
                (await notesHold(tx, command))
              if (!holds) return 'changed' as const
              await write(tx, command)
              return 'saved' as const
            },
            { isolationLevel: 'Serializable' },
          ),
        ),
      ),
  }
}
