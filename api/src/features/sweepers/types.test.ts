import { describe, expect, it } from 'vitest'
import { createSweeper } from '../../test/factories.ts'
import {
  bonusPinsSchema,
  sweeperListSchema,
  toVendorSweeper,
  vendorSweeperSchema,
} from './types.ts'

describe('toVendorSweeper', () => {
  it('keeps only the fields the registration site reads (API-04, D-09)', () => {
    const vendor = toVendorSweeper(
      createSweeper({
        bonusPins: [
          { divisionId: crypto.randomUUID(), divisionName: 'Open', bonusPinsPerGame: 10 },
        ],
      }),
    )

    expect(Object.keys(vendor).sort()).toEqual(['date', 'entryFee', 'games', 'id'])
    expect(vendorSweeperSchema.safeParse(vendor).success).toBe(true)
  })
})

describe('bonusPinsSchema', () => {
  const entry = { divisionId: crypto.randomUUID(), divisionName: 'Open' }

  it('accepts whole numbers of pins, positive or negative (DIV-14)', () => {
    expect(bonusPinsSchema.safeParse({ ...entry, bonusPinsPerGame: 10 }).success).toBe(true)
    expect(bonusPinsSchema.safeParse({ ...entry, bonusPinsPerGame: -3 }).success).toBe(true)
  })

  it.each([2.5, '10', null])('refuses %s pins', (pins) => {
    expect(bonusPinsSchema.safeParse({ ...entry, bonusPinsPerGame: pins }).success).toBe(false)
  })
})

describe('sweeperListSchema', () => {
  it('wraps the sweepers as the route does (SQD-22)', () => {
    const sweeper = createSweeper()

    expect(sweeperListSchema.safeParse({ sweepers: [sweeper] }).success).toBe(true)
    expect(sweeperListSchema.safeParse({ sweepers: [] }).success).toBe(true)
    expect(sweeperListSchema.safeParse([sweeper]).success).toBe(false)
    expect(sweeperListSchema.safeParse({ sweepers: [{ id: 'x' }] }).success).toBe(false)
  })
})
