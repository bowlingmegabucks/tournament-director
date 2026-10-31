import { describe, expect, it } from 'vitest'
import { formatHandicap, formatHandicapTotal } from './format'

describe('formatHandicap (RPT-05a)', () => {
  it.each([
    [47, '47'],
    [1, '1'],
    [0, '-'],
    [-3, '-'],
  ])('shows %i as %s', (handicap, expected) => {
    expect(formatHandicap(handicap)).toBe(expected)
  })
})

describe('formatHandicapTotal (RPT-05a)', () => {
  it('multiplies the handicap by the games', () => {
    expect(formatHandicapTotal(47, 6)).toBe('282')
  })

  it('shows a dash when the handicap is 0 or less', () => {
    expect(formatHandicapTotal(0, 6)).toBe('-')
    expect(formatHandicapTotal(-2, 6)).toBe('-')
  })
})
