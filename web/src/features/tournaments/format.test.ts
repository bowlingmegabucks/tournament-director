import { describe, expect, it } from 'vitest'
import { formatDateRange, formatFee } from './format'

describe('formatDateRange', () => {
  it.each([
    ['2026-10-23', '2026-10-25', 'Oct 23 to Oct 25, 2026'],
    ['2026-10-01', '2026-10-01', 'Oct 1, 2026'],
    ['2025-12-30', '2026-01-02', 'Dec 30, 2025 to Jan 2, 2026'],
    ['2026-09-30', '2026-10-02', 'Sep 30 to Oct 2, 2026'],
  ])('%s to %s reads %s', (start, end, expected) => {
    expect(formatDateRange(start, end)).toBe(expected)
  })
})

describe('formatFee', () => {
  it.each([
    [50, '$50.00'],
    [45.5, '$45.50'],
    [1234.56, '$1,234.56'],
  ])('%d reads %s', (fee, expected) => {
    expect(formatFee(fee)).toBe(expected)
  })
})
