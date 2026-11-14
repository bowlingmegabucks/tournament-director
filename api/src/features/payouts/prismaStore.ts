import { randomUUID } from 'node:crypto'
import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import { centsFromText, formatCents } from './money.ts'
import { lockedMessage, planSave, type Gate } from './savePlan.ts'
import type { EventFacts, PayoutStore, SaveInput, SaveOutcome } from './store.ts'
import { payoutSources, type PayoutRecord, type PayoutSource } from './types.ts'

/** `Squads.SquadType`: a squad is 0, a sweeper is 1. */
const squadTypes = { squad: 0, sweeper: 1 }

/** What a query needs: the client, or the client inside a transaction. */
type Reader = Pick<PrismaClient, 'tournament' | 'squad' | 'division' | 'payout'>

const sourceNames: readonly string[] = payoutSources
const isSource = (value: string): value is PayoutSource => sourceNames.includes(value)

interface Row {
  id: string
  tournamentId: string
  source: string
  eventId: string
  registrationId: string
  amount: { toFixed(places: number): string }
  note: string | null
  paid: boolean
}

/** A stored row as a record, or `null` for a `Source` the API never writes (a row we do not understand). */
function toRecord(row: Row): PayoutRecord | null {
  if (!isSource(row.source)) return null
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    source: row.source,
    eventId: row.eventId,
    registrationId: row.registrationId,
    amountCents: centsFromText(row.amount.toFixed(2)),
    note: row.note,
    paid: row.paid,
  }
}

/** The lock and the gate of one event, read with `client` (D-272, D-273). */
async function readFacts(
  client: Reader,
  tournamentId: string,
  source: PayoutSource,
  eventId: string,
): Promise<EventFacts> {
  const tournament = await client.tournament.findUnique({
    where: { id: tournamentId },
    select: { completed: true },
  })
  if (!tournament) return { notFound: 'tournament' }
  const tournamentComplete = tournament.completed

  let gate: Gate
  if (source === 'squad' || source === 'sweeper') {
    const session = await client.squad.findFirst({
      where: { id: eventId, tournamentId, squadType: squadTypes[source] },
      select: { complete: true },
    })
    if (!session) return { notFound: 'event' }
    gate = { kind: source, complete: session.complete }
  } else if (source === 'superSweeper') {
    const where = { tournamentId, squadType: squadTypes.sweeper }
    const [sweepers, open] = await Promise.all([
      client.squad.count({ where }),
      client.squad.count({ where: { ...where, complete: false } }),
    ])
    gate = { kind: 'superSweeper', sweepers, open }
  } else {
    const division = await client.division.findFirst({
      where: { id: eventId, tournamentId },
      select: { id: true },
    })
    if (!division) return { notFound: 'event' }
    const where = { tournamentId, squadType: squadTypes.squad }
    const [squads, open] = await Promise.all([
      client.squad.count({ where }),
      client.squad.count({ where: { ...where, complete: false } }),
    ])
    gate = { kind: 'finals', squads, open }
  }
  return { tournamentComplete, gate }
}

/** The payouts in the `Payouts` table (D-267, D-281). */
export function createPrismaPayoutStore(client: PrismaClient, logger: Logger): PayoutStore {
  async function saveOnce(input: SaveInput): Promise<SaveOutcome> {
    return client.$transaction(
      async (tx) => {
        const facts = await readFacts(tx, input.tournamentId, input.source, input.eventId)
        if ('notFound' in facts) return facts
        const where = {
          tournamentId: input.tournamentId,
          source: input.source,
          eventId: input.eventId,
        }
        const existing = (await tx.payout.findMany({ where })).flatMap((row) => toRecord(row) ?? [])
        const plan = planSave(
          {
            tournamentComplete: facts.tournamentComplete,
            gate: facts.gate,
            inferred: input.inferred,
            entered: input.entered,
            existing: existing.map((record) => ({
              id: record.id,
              registrationId: record.registrationId,
              amount: formatCents(record.amountCents),
              note: record.note,
              paid: record.paid,
            })),
            confirmPaid: input.confirmPaid,
          },
          input.rows,
        )
        if (plan.kind === 'refused') return { refused: plan.reason }
        if (plan.kind === 'invalid') return { invalid: plan.errors }
        if (plan.kind === 'confirm') return { confirm: plan.paidChanges }

        const now = new Date()
        if (plan.deletes.length > 0) {
          await tx.payout.deleteMany({ where: { id: { in: plan.deletes } } })
        }
        await Promise.all(
          plan.updates.map((change) =>
            tx.payout.update({
              where: { id: change.id },
              data: {
                amount: formatCents(change.amountCents),
                note: change.note,
                paid: change.paid,
                updatedAt: now,
                updatedBy: input.actorId,
              },
            }),
          ),
        )
        if (plan.creates.length > 0) {
          await tx.payout.createMany({
            data: plan.creates.map((create) => ({
              id: randomUUID(),
              ...where,
              registrationId: create.registrationId,
              amount: formatCents(create.amountCents),
              note: create.note,
              paid: create.paid,
              createdAt: now,
              createdBy: input.actorId,
              updatedAt: now,
              updatedBy: input.actorId,
            })),
          })
        }
        const sum = await tx.payout.aggregate({ where, _sum: { amount: true } })
        return {
          saved: {
            created: plan.creates.length,
            changed: plan.updates.length,
            deleted: plan.deletes.length,
            total: sum._sum.amount?.toFixed(2) ?? '0.00',
          },
        }
      },
      { isolationLevel: 'Serializable' },
    )
  }

  return {
    // The public results only tag a casher with this amount. A table that is missing (the script has
    // not run yet) or a failed read must not take the results down: log it and show no amounts.
    listAmounts: async (tournamentId) => {
      try {
        const rows = await client.payout.findMany({
          where: { tournamentId },
          select: { source: true, eventId: true, registrationId: true, amount: true },
        })
        return rows.flatMap((row) =>
          isSource(row.source)
            ? [
                {
                  source: row.source,
                  eventId: row.eventId,
                  registrationId: row.registrationId,
                  amount: row.amount.toFixed(2),
                },
              ]
            : [],
        )
      } catch (err) {
        logger.error({ err, tournamentId }, 'Payout amounts unavailable, so the results show none')
        return []
      }
    },
    list: (tournamentId) =>
      withDatabaseErrors(logger, async () =>
        (await client.payout.findMany({ where: { tournamentId } })).flatMap(
          (row) => toRecord(row) ?? [],
        ),
      ),
    eventFacts: (tournamentId, source, eventId) =>
      withDatabaseErrors(logger, () => readFacts(client, tournamentId, source, eventId)),
    save: (input) => withDatabaseErrors(logger, () => withRetry(() => saveOnce(input))),
    setPaid: (tournamentId, payoutId, paid, actorId) =>
      withDatabaseErrors(logger, () =>
        withRetry(() =>
          client.$transaction(
            async (tx) => {
              const row = await tx.payout.findFirst({ where: { id: payoutId, tournamentId } })
              if (!row || !isSource(row.source)) return { notFound: true as const }
              const tournament = await tx.tournament.findUnique({
                where: { id: tournamentId },
                select: { completed: true },
              })
              if (!tournament) return { notFound: true as const }
              if (tournament.completed) return { refused: lockedMessage }
              const changed = row.paid !== paid
              const updated = changed
                ? await tx.payout.update({
                    where: { id: payoutId },
                    data: { paid, updatedAt: new Date(), updatedBy: actorId },
                  })
                : row
              const payout = toRecord(updated)
              if (!payout) return { notFound: true as const }
              return { payout, changed }
            },
            { isolationLevel: 'Serializable' },
          ),
        ),
      ),
    summary: (tournamentId) =>
      withDatabaseErrors(logger, async () => {
        const [count, unpaid] = await Promise.all([
          client.payout.count({ where: { tournamentId } }),
          client.payout.aggregate({
            where: { tournamentId, paid: false },
            _count: true,
            _sum: { amount: true },
          }),
        ])
        return {
          count,
          unpaidCount: unpaid._count,
          unpaidCents: centsFromText(unpaid._sum.amount?.toFixed(2) ?? '0'),
        }
      }),
  }
}
