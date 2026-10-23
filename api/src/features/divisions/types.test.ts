import { describe, expect, it } from 'vitest'
import { createDivision } from '../../test/factories.ts'
import { divisionListSchema, toVendorDivision, vendorDivisionSchema } from './types.ts'

describe('toVendorDivision', () => {
  it('keeps only the fields the registration site reads (API-04, D-09)', () => {
    const division = createDivision({
      gender: 'Female',
      minimumAverage: 100,
      handicapPercentage: 90,
      handicapBase: 220,
    })

    const vendor = toVendorDivision(division)

    expect(Object.keys(vendor).sort()).toEqual(
      [
        'gender',
        'id',
        'maximumAge',
        'maximumAverage',
        'minimumAge',
        'minimumAverage',
        'name',
      ].sort(),
    )
    expect(vendorDivisionSchema.safeParse(vendor).success).toBe(true)
    expect(vendor).toMatchObject({ id: division.id, gender: 'Female', minimumAverage: 100 })
  })
})

describe('divisionListSchema', () => {
  it('wraps the divisions as the route does (DIV-12)', () => {
    const division = createDivision()

    expect(divisionListSchema.safeParse({ divisions: [division] }).success).toBe(true)
    expect(divisionListSchema.safeParse({ divisions: [] }).success).toBe(true)
    expect(divisionListSchema.safeParse([division]).success).toBe(false)
    expect(divisionListSchema.safeParse({}).success).toBe(false)
    expect(divisionListSchema.safeParse({ divisions: [{ id: 'x' }] }).success).toBe(false)
  })
})
