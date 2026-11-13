import { describe, expect, it } from 'vitest'
import { buildRows, type ListContext } from './listView.ts'
import type { PayoutRecord } from './types.ts'

const context: ListContext = {
  squads: [
    { id: 's2', date: '2026-10-25T09:00:00' },
    { id: 's1', date: '2026-10-24T09:00:00' },
  ],
  sweepers: [{ id: 'w1', date: '2026-10-24T13:00:00' }],
  divisions: [
    { id: 'd2', number: 2, name: 'Women' },
    { id: 'd1', number: 1, name: 'Open' },
  ],
  registrations: [
    { id: 'r1', bowler: { name: 'Dana Whitfield' }, divisionName: 'Open' },
    { id: 'r2', bowler: { name: 'Amy Park' }, divisionName: 'Women' },
  ],
}

const record = (over: Partial<PayoutRecord> = {}): PayoutRecord => ({
  id: crypto.randomUUID(),
  tournamentId: 't',
  source: 'squad',
  eventId: 's1',
  registrationId: 'r1',
  amountCents: 10000,
  note: null,
  paid: false,
  ...over,
})

describe('buildRows (PAY-19)', () => {
  it('names each event and bowler and writes the amount as money text', () => {
    const [row] = buildRows([record({ note: 'why', paid: true })], context)

    expect(row).toMatchObject({
      source: 'squad',
      eventId: 's1',
      eventLabel: 'Squad',
      eventDate: '2026-10-24T09:00:00',
      registrationId: 'r1',
      name: 'Dana Whitfield',
      divisionName: 'Open',
      amount: '100.00',
      note: 'why',
      paid: true,
    })
  })

  it('lists squads by date, then sweepers, then the super sweeper, then each division’s finals by number', () => {
    const rows = buildRows(
      [
        record({ source: 'finals', eventId: 'd2' }),
        record({ source: 'finals', eventId: 'd1' }),
        record({ source: 'superSweeper', eventId: 't' }),
        record({ source: 'sweeper', eventId: 'w1' }),
        record({ source: 'squad', eventId: 's2' }),
        record({ source: 'squad', eventId: 's1' }),
      ],
      context,
    )

    expect(rows.map((row) => [row.eventLabel, row.eventDate])).toEqual([
      ['Squad', '2026-10-24T09:00:00'],
      ['Squad', '2026-10-25T09:00:00'],
      ['Sweeper', '2026-10-24T13:00:00'],
      ['Super sweeper', null],
      ['Finals: Open', null],
      ['Finals: Women', null],
    ])
  })

  it('sorts the bowlers of one event by name, ignoring case', () => {
    const rows = buildRows(
      [record({ registrationId: 'r1' }), record({ registrationId: 'r2' })],
      context,
    )

    expect(rows.map((row) => row.name)).toEqual(['Amy Park', 'Dana Whitfield'])
  })

  it('keeps a payout whose bowler or event is gone, as an unknown bowler and an empty division name', () => {
    const rows = buildRows(
      [
        record({ registrationId: 'gone' }),
        record({ source: 'finals', eventId: 'gone', registrationId: 'r1' }),
        record({ source: 'squad', eventId: 'gone', registrationId: 'r1' }),
      ],
      context,
    )

    expect(rows.find((row) => row.registrationId === 'gone')).toMatchObject({
      name: 'Unknown bowler',
      divisionName: '',
    })
    expect(rows.map((row) => row.eventLabel)).toContain('Finals: ')
    expect(
      rows.find((row) => row.eventId === 'gone' && row.source === 'squad')?.eventDate,
    ).toBeNull()
  })

  it('is empty for no payouts', () => {
    expect(buildRows([], context)).toEqual([])
  })
})
