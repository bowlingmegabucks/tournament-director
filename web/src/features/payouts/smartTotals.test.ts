import { describe, expect, it } from 'vitest'
import { smartCents, splitMoney, totalFigures } from './smartTotals'

describe('SMART totals (SMT-04)', () => {
  it('adds only the scholarship lines, and treats unreadable text as nothing', () => {
    const lines = [
      { amount: '75.00', smartScholarship: true },
      { amount: '25.50', smartScholarship: true },
      { amount: '100.00', smartScholarship: false },
      { amount: 'x', smartScholarship: true },
    ]

    expect(smartCents(lines)).toBe(10050)
  })

  it('shows one total with no scholarship money', () => {
    expect(totalFigures(10000, 0)).toEqual(['Total $100.00'])
    expect(splitMoney(10000, 0)).toBe('$100.00')
  })

  it('splits the total into cash and scholarship money', () => {
    expect(totalFigures(10000, 7500)).toEqual([
      'Total $100.00',
      'Cash $25.00',
      'SMART scholarship $75.00',
    ])
    expect(splitMoney(10000, 7500)).toBe('$100.00: $25.00 cash, $75.00 SMART scholarship')
  })
})
