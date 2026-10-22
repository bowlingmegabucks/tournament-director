import { describe, expect, it } from 'vitest'
import { createTournament } from '../../test/factories.ts'
import { toTournament, type TournamentRow } from './tournamentRow.ts'

function createRow(overrides: Partial<TournamentRow> = {}): TournamentRow {
  const tournament = createTournament()
  return {
    id: tournament.id,
    name: 'Northeast MegaBuck$ Tournament',
    start: new Date('2026-10-23T00:00:00.000Z'),
    end: new Date('2026-10-25T00:00:00.000Z'),
    entryFee: { toNumber: () => 50 },
    bowlingCenter: 'Spare Time Lanes, Worcester MA',
    ...overrides,
  }
}

describe('toTournament', () => {
  it('converts midnight start and end to dates, and a decimal fee to a number (TRN-11)', () => {
    const row = createRow({ entryFee: { toNumber: () => 47.5 } })

    expect(toTournament(row)).toEqual({
      success: true,
      data: {
        id: row.id,
        name: 'Northeast MegaBuck$ Tournament',
        startDate: '2026-10-23',
        endDate: '2026-10-25',
        entryFee: 47.5,
        bowlingCenter: 'Spare Time Lanes, Worcester MA',
      },
    })
  })

  it('accepts a one-day tournament (TRN-11)', () => {
    const day = new Date('2026-10-23T00:00:00.000Z')

    const result = toTournament(createRow({ start: day, end: day }))

    expect(result.success && [result.data.startDate, result.data.endDate]).toEqual([
      '2026-10-23',
      '2026-10-23',
    ])
  })

  it.each([
    ['an id that is not a UUID', { id: 'not-a-uuid' }],
    ['an empty name', { name: '' }],
    ['a fee of zero', { entryFee: { toNumber: () => 0 } }],
    ['an empty bowling center', { bowlingCenter: '' }],
    ['a start date that cannot be read', { start: new Date('0000-00-00') }],
    ['an end date that cannot be read', { end: new Date(Number.NaN) }],
  ])('rejects a row with %s (D-31)', (_label, override) => {
    expect(toTournament(createRow(override)).success).toBe(false)
  })
})
