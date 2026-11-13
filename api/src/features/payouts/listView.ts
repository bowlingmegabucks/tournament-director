import { formatCents } from './money.ts'
import type { PayoutRecord, PayoutRow } from './types.ts'

/** What the list needs to name an event and a bowler. */
export interface ListContext {
  squads: readonly { id: string; date: string }[]
  sweepers: readonly { id: string; date: string }[]
  divisions: readonly { id: string; number: number; name: string }[]
  registrations: readonly { id: string; bowler: { name: string }; divisionName: string }[]
}

/**
 * The lines of `GET /payouts` (PAY-19): every payout of the tournament with its event and bowler,
 * squads by date, then sweepers by date, then the super sweeper, then each division's finals by
 * number, and inside an event by name. A payout whose bowler or event is gone (it cannot happen,
 * but storage has no foreign key) still lists, as an unknown bowler.
 */
export function buildRows(records: readonly PayoutRecord[], context: ListContext): PayoutRow[] {
  const squadAt = new Map(context.squads.map((squad) => [squad.id, squad.date]))
  const sweeperAt = new Map(context.sweepers.map((sweeper) => [sweeper.id, sweeper.date]))
  const divisionBy = new Map(context.divisions.map((division) => [division.id, division]))
  const registrationBy = new Map(
    context.registrations.map((registration) => [registration.id, registration]),
  )

  const describe = (record: PayoutRecord) => {
    switch (record.source) {
      case 'squad':
        return { label: 'Squad', date: squadAt.get(record.eventId) ?? null, order: [0, 0] }
      case 'sweeper':
        return { label: 'Sweeper', date: sweeperAt.get(record.eventId) ?? null, order: [1, 0] }
      case 'superSweeper':
        return { label: 'Super sweeper', date: null, order: [2, 0] }
      case 'finals': {
        const division = divisionBy.get(record.eventId)
        return {
          label: `Finals: ${division?.name ?? ''}`,
          date: null,
          order: [3, division?.number ?? 0],
        }
      }
    }
  }

  return records
    .map((record) => {
      const event = describe(record)
      const registration = registrationBy.get(record.registrationId)
      const row: PayoutRow = {
        id: record.id,
        source: record.source,
        eventId: record.eventId,
        eventLabel: event.label,
        eventDate: event.date,
        registrationId: record.registrationId,
        name: registration?.bowler.name ?? 'Unknown bowler',
        divisionName: registration?.divisionName ?? '',
        amount: formatCents(record.amountCents),
        note: record.note,
        paid: record.paid,
      }
      return { row, event }
    })
    .toSorted(
      (a, b) =>
        (a.event.order[0] ?? 0) - (b.event.order[0] ?? 0) ||
        (a.event.order[1] ?? 0) - (b.event.order[1] ?? 0) ||
        (a.event.date ?? '').localeCompare(b.event.date ?? '') ||
        a.row.eventId.localeCompare(b.row.eventId) ||
        a.row.name.localeCompare(b.row.name, 'en', { sensitivity: 'base' }),
    )
    .map(({ row }) => row)
}
