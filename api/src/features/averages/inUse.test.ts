import { describe, expect, it } from 'vitest'
import { averageInUse, averageStatus, type AverageCheck } from './inUse.ts'

const verified: AverageCheck = { providedAverage: 175, verifiedAverage: 175, note: null }
const adjusted: AverageCheck = { providedAverage: 175, verifiedAverage: 182, note: 'USBC book' }

describe('averageInUse (AVG-09, D-288)', () => {
  it('uses the provided average when no one checked it', () => {
    expect(averageInUse(175, undefined)).toBe(175)
  })

  it('uses the verified average of a verified registration', () => {
    expect(averageInUse(175, verified)).toBe(175)
  })

  it('uses the adjusted average, not the provided one', () => {
    expect(averageInUse(175, adjusted)).toBe(182)
  })

  it('has no average when the bowler gave none and no one adjusted it', () => {
    expect(averageInUse(null, undefined)).toBeNull()
  })

  it('uses an adjusted average for a bowler who gave none', () => {
    expect(
      averageInUse(null, { providedAverage: null, verifiedAverage: 160, note: 'League sheet' }),
    ).toBe(160)
  })
})

describe('averageStatus (D-287)', () => {
  it('is unverified with no check', () => {
    expect(averageStatus(undefined)).toBe('unverified')
  })

  it('is verified when the check has no note', () => {
    expect(averageStatus(verified)).toBe('verified')
  })

  it('is adjusted when the check has a note', () => {
    expect(averageStatus(adjusted)).toBe('adjusted')
  })
})
