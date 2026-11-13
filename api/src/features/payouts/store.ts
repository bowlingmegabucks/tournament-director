import { formatCents } from './money.ts'
import { lockedMessage, planSave, type Gate, type PaidChange, type SaveRow } from './savePlan.ts'
import type { PayoutRecord, PayoutSource } from './types.ts'

/**
 * What the routes and the results need to keep payouts (D-267): the `Payouts` table in Prisma, a
 * list in memory for tests.
 */

/** A saved amount and nothing else: what the public results read (PAY-20, D-284). */
export interface PayoutAmountRow {
  source: PayoutSource
  eventId: string
  registrationId: string
  /** Money text, `"100.00"`. */
  amount: string
}

export interface PayoutAmounts {
  /** Every saved amount of the tournament. The note, the paid flag, and the users stay out. */
  listAmounts(tournamentId: string): Promise<PayoutAmountRow[]>
}

/** The facts an entry sheet and a save depend on (D-272, D-273). */
export type EventFacts =
  { notFound: 'tournament' | 'event' } | { tournamentComplete: boolean; gate: Gate }

export interface SaveInput {
  tournamentId: string
  source: PayoutSource
  eventId: string
  rows: readonly SaveRow[]
  confirmPaid: boolean
  /** The user id, for who saved it. */
  actorId: string
  /** The bowlers the results say get paid (D-268), worked out before the save. */
  inferred: ReadonlySet<string>
  /** Everyone entered in the event, by registration id, with the name (D-269). */
  entered: ReadonlyMap<string, string>
}

export type SaveOutcome =
  | { notFound: 'tournament' | 'event' }
  | { refused: string }
  | { invalid: Record<string, string> }
  | { confirm: PaidChange[] }
  | {
      saved: {
        created: number
        changed: number
        deleted: number
        /** What the event holds after the save, `"325.00"`. */
        total: string
      }
    }

export type PaidOutcome =
  { notFound: true } | { refused: string } | { payout: PayoutRecord; changed: boolean }

export interface PayoutStore extends PayoutAmounts {
  /** Every payout of the tournament. */
  list(tournamentId: string): Promise<PayoutRecord[]>
  /** The tournament lock and the gate of one event; or what is missing. */
  eventFacts(tournamentId: string, source: PayoutSource, eventId: string): Promise<EventFacts>
  /** Save the whole event in one transaction (PAY-12, D-278). The facts are read inside it. */
  save(input: SaveInput): Promise<SaveOutcome>
  /** Set the paid flag (PAY-13, D-274). Refused once the tournament is complete. */
  setPaid(
    tournamentId: string,
    payoutId: string,
    paid: boolean,
    actorId: string,
  ): Promise<PaidOutcome>
  /** Counts for the Complete dialog (PAY-15, D-279). */
  summary(
    tournamentId: string,
  ): Promise<{ count: number; unpaidCount: number; unpaidCents: number }>
}

/** Storage in memory, for tests. `facts` answers for any event; `records` is the table. */
export function createInMemoryPayoutStore(
  seed: readonly PayoutRecord[] = [],
  facts: (tournamentId: string, source: PayoutSource, eventId: string) => EventFacts = () => ({
    tournamentComplete: false,
    gate: { kind: 'squad', complete: true },
  }),
) {
  const records: PayoutRecord[] = [...seed]
  let counter = 0
  const store: PayoutStore = {
    listAmounts: (tournamentId) =>
      Promise.resolve(
        records
          .filter((record) => record.tournamentId === tournamentId)
          .map(({ source, eventId, registrationId, amountCents }) => ({
            source,
            eventId,
            registrationId,
            amount: formatCents(amountCents),
          })),
      ),
    list: (tournamentId) =>
      Promise.resolve(records.filter((record) => record.tournamentId === tournamentId)),
    eventFacts: (tournamentId, source, eventId) =>
      Promise.resolve(facts(tournamentId, source, eventId)),
    save(input) {
      const found = facts(input.tournamentId, input.source, input.eventId)
      if ('notFound' in found) return Promise.resolve(found)
      const inEvent = records.filter(
        (record) =>
          record.tournamentId === input.tournamentId &&
          record.source === input.source &&
          record.eventId === input.eventId,
      )
      const plan = planSave(
        {
          tournamentComplete: found.tournamentComplete,
          gate: found.gate,
          inferred: input.inferred,
          entered: input.entered,
          existing: inEvent.map((record) => ({
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
      if (plan.kind === 'refused') return Promise.resolve({ refused: plan.reason })
      if (plan.kind === 'invalid') return Promise.resolve({ invalid: plan.errors })
      if (plan.kind === 'confirm') return Promise.resolve({ confirm: plan.paidChanges })
      for (const id of plan.deletes) {
        const at = records.findIndex((record) => record.id === id)
        records.splice(at, 1)
      }
      for (const change of plan.updates) {
        const found = records.find((record) => record.id === change.id)
        if (found) Object.assign(found, change)
      }
      for (const create of plan.creates) {
        counter += 1
        records.push({
          id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
          tournamentId: input.tournamentId,
          source: input.source,
          eventId: input.eventId,
          ...create,
        })
      }
      const total = records
        .filter((record) => record.source === input.source && record.eventId === input.eventId)
        .reduce((sum, record) => sum + record.amountCents, 0)
      return Promise.resolve({
        saved: {
          created: plan.creates.length,
          changed: plan.updates.length,
          deleted: plan.deletes.length,
          total: formatCents(total),
        },
      })
    },
    setPaid(tournamentId, payoutId, paid) {
      const record = records.find(
        (item) => item.id === payoutId && item.tournamentId === tournamentId,
      )
      if (!record) return Promise.resolve({ notFound: true })
      const found = facts(tournamentId, record.source, record.eventId)
      if ('notFound' in found) return Promise.resolve({ notFound: true })
      if (found.tournamentComplete) {
        return Promise.resolve({ refused: lockedMessage })
      }
      const changed = record.paid !== paid
      record.paid = paid
      return Promise.resolve({ payout: { ...record }, changed })
    },
    summary(tournamentId) {
      const mine = records.filter((record) => record.tournamentId === tournamentId)
      const unpaid = mine.filter((record) => !record.paid)
      return Promise.resolve({
        count: mine.length,
        unpaidCount: unpaid.length,
        unpaidCents: unpaid.reduce((sum, record) => sum + record.amountCents, 0),
      })
    },
  }
  return { store, records }
}
