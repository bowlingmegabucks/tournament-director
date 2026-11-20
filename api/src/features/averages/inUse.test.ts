import { describe, expect, it } from 'vitest'
import {
  afterVendorAverage,
  averageInUse,
  averageStatus,
  liveCheck,
  type AverageCheck,
} from './inUse.ts'

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

describe('liveCheck (AVG-08)', () => {
  it('keeps a check made on the average the registration holds now', () => {
    expect(liveCheck(175, verified)).toBe(verified)
  })

  it('drops a check made on another average, as when WinForms edited the column', () => {
    expect(liveCheck(150, verified)).toBeUndefined()
  })

  it('matches a bowler with no average to a check made with none', () => {
    const noAverage = { providedAverage: null, verifiedAverage: 160, note: 'League sheet' }

    expect(liveCheck(null, noAverage)).toBe(noAverage)
    expect(liveCheck(150, noAverage)).toBeUndefined()
  })

  it('has nothing to keep with no check', () => {
    expect(liveCheck(175, undefined)).toBeUndefined()
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

describe('afterVendorAverage (AVG-08, D-299)', () => {
  it('turns a verified check into an adjusted one that says why, and keeps the verified number', () => {
    expect(afterVendorAverage(verified, 180)).toEqual({
      providedAverage: 180,
      verifiedAverage: 175,
      note: 'Adjusted to 175 based on previous verification. Vendor sent 180.',
    })
  })

  it("keeps a director's note when the vendor sends another number", () => {
    expect(afterVendorAverage(adjusted, 190)).toEqual({
      providedAverage: 190,
      verifiedAverage: 182,
      note: 'USBC book',
    })
  })

  it('makes an adjusted check plain verified when the vendor sends the verified number', () => {
    expect(afterVendorAverage(adjusted, 182)).toEqual({
      providedAverage: 182,
      verifiedAverage: 182,
      note: null,
    })
  })

  it('keeps the check counting: it matches the new provided number', () => {
    expect(liveCheck(180, afterVendorAverage(verified, 180))).toBeDefined()
  })
})
