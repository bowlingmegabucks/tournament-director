import { describe, expect, it } from 'vitest'
import { createSquad } from '../../test/factories.ts'
import { squadListSchema, toVendorSquad, vendorSquadSchema } from './types.ts'

describe('toVendorSquad', () => {
  it('keeps only the fields the registration site reads (API-04, D-09)', () => {
    const vendor = toVendorSquad(createSquad({ complete: true }))

    expect(Object.keys(vendor).sort()).toEqual(['date', 'entryFee', 'id'])
    expect(vendorSquadSchema.safeParse(vendor).success).toBe(true)
  })

  it('sends null when the squad uses the tournament fee (API-04)', () => {
    const squad = createSquad({ entryFee: 50, entryFeeOverridden: false })

    expect(toVendorSquad(squad).entryFee).toBeNull()
  })

  it('sends the squad fee when it overrides (API-04)', () => {
    const squad = createSquad({ entryFee: 60, entryFeeOverridden: true })

    expect(toVendorSquad(squad).entryFee).toBe(60)
  })
})

describe('squadListSchema', () => {
  it('wraps the squads as the route does (SQD-21)', () => {
    const squad = createSquad()

    expect(squadListSchema.safeParse({ squads: [squad] }).success).toBe(true)
    expect(squadListSchema.safeParse({ squads: [] }).success).toBe(true)
    expect(squadListSchema.safeParse([squad]).success).toBe(false)
    expect(squadListSchema.safeParse({ squads: [{ id: 'x' }] }).success).toBe(false)
  })
})
