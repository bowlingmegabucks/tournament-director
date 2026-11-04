import { describe, expect, it } from 'vitest'
import { describeChange } from './describeChange'
import { emptyTournamentForm } from './validateTournament'

const initial = {
  ...emptyTournamentForm,
  entryFee: '60',
  startDate: '2026-11-14',
  finalsRatio: '8',
}

describe('describeChange (TRN-30)', () => {
  it('shows a fee as dollars with cents', () => {
    expect(describeChange('entryFee', initial, { ...initial, entryFee: '75' })).toBe(
      'Entry fee: $60.00 → $75.00',
    )
    expect(describeChange('entryFee', initial, { ...initial, entryFee: '62.5' })).toBe(
      'Entry fee: $60.00 → $62.50',
    )
  })

  it('shows a date and a ratio as typed', () => {
    expect(describeChange('startDate', initial, { ...initial, startDate: '2026-11-13' })).toBe(
      'Start date: 2026-11-14 → 2026-11-13',
    )
    expect(describeChange('finalsRatio', initial, { ...initial, finalsRatio: ' 7.5 ' })).toBe(
      'Finals ratio: 8 → 7.5',
    )
  })

  it('names a stored super sweeper ratio of 0, shown empty, as not set (D-17)', () => {
    expect(
      describeChange('superSweeperCashRatio', initial, { ...initial, superSweeperCashRatio: '6' }),
    ).toBe('Super sweeper cash ratio: not set → 6')
  })

  it.each([
    ['name', 'Name'],
    ['endDate', 'End date'],
    ['bowlingCenter', 'Bowling center'],
    ['games', 'Games'],
    ['cashRatio', 'Cash ratio'],
  ] as const)('names %s as %s', (field, name) => {
    expect(describeChange(field, initial, { ...initial, [field]: 'x' })).toMatch(
      new RegExp(`^${name}: `),
    )
  })
})
