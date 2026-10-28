import { describe, expect, it } from 'vitest'
import { handicap, type HandicapSettings } from './handicap.ts'

const settings: HandicapSettings = {
  handicapBase: 220,
  handicapPercentage: 90,
  maximumHandicapPerGame: 50,
}

describe('handicap (SCR-07)', () => {
  it.each([
    [230, 0],
    [220, 0],
    [200, 18],
    [150, 50],
    [null, 0],
  ])('an average of %s gives %s', (average, expected) => {
    expect(handicap(average, settings)).toBe(expected)
  })

  it('floors the raw handicap', () => {
    // (220 - 199) x 0.90 = 18.9
    expect(handicap(199, settings)).toBe(18)
  })

  it('has no cap below 999 when the division sets no maximum', () => {
    expect(handicap(100, { ...settings, maximumHandicapPerGame: null })).toBe(108)
    expect(
      handicap(0, { handicapBase: 2000, handicapPercentage: 100, maximumHandicapPerGame: null }),
    ).toBe(999)
  })

  it.each([
    ['base', { handicapBase: null }],
    ['percentage', { handicapPercentage: null }],
  ])('is 0 when the %s is missing', (_name, missing) => {
    expect(handicap(150, { ...settings, ...missing })).toBe(0)
  })

  it('keeps 20 x 90% at exactly 18', () => {
    expect(handicap(200, { ...settings, maximumHandicapPerGame: null })).toBe(18)
  })
})
