import { describe, expect, it } from 'vitest'
import { createDivision } from '../../mocks/data'
import { formatGender, formatHandicap, formatRange } from './format'

describe('formatRange', () => {
  it.each([
    [null, null, 'Any'],
    [18, 39, '18 to 39'],
    [50, null, '50 and up'],
    [null, 199, 'Up to 199'],
    [0, null, '0 and up'],
    [null, 0, 'Up to 0'],
  ])('shows %s and %s as "%s" (DIV-12)', (minimum, maximum, text) => {
    expect(formatRange(minimum, maximum)).toBe(text)
  })
})

describe('formatGender', () => {
  it.each([
    [null, 'Any'],
    ['Male', 'Male'],
    ['Female', 'Female'],
  ] as const)('shows %s as "%s" (DIV-12)', (gender, text) => {
    expect(formatGender(gender)).toBe(text)
  })
})

describe('formatHandicap', () => {
  const handicap = (
    handicapPercentage: number | null,
    handicapBase: number | null,
    maximumHandicapPerGame: number | null,
  ) => formatHandicap(createDivision({ handicapPercentage, handicapBase, maximumHandicapPerGame }))

  it.each([
    [null, null, null, 'Scratch'],
    [90, 220, null, '90% of 220'],
    [90, 220, 40, '90% of 220, max 40 a game'],
    [0, 220, null, '0% of 220'],
    // Old rows may break DIV-09 and DIV-11. Show what is stored.
    [90, null, null, '90%'],
    [null, 220, null, 'Base 220'],
    [null, null, 40, 'Scratch'],
  ])('shows percent %s, base %s, cap %s as "%s" (DIV-12)', (percent, base, cap, text) => {
    expect(handicap(percent, base, cap)).toBe(text)
  })
})
