import { describe, expect, it } from 'vitest'
import { summarize, totalsByBowler, type TotalInput } from './totals.ts'

const row = (overrides: Partial<TotalInput> = {}): TotalInput => ({
  registrationId: 'r1',
  name: 'Dana Whitfield',
  divisionName: 'Open',
  amountCents: 10000,
  paid: false,
  ...overrides,
})

describe('totalsByBowler (PAY-19)', () => {
  it('adds every event a bowler was paid in, and the unpaid part', () => {
    const totals = totalsByBowler([
      row({ amountCents: 10000, paid: true }),
      row({ amountCents: 25050 }),
      row({ amountCents: 150000 }),
    ])
    expect(totals).toEqual([
      {
        registrationId: 'r1',
        name: 'Dana Whitfield',
        divisionName: 'Open',
        count: 3,
        total: '1850.50',
        unpaidTotal: '1750.50',
      },
    ])
  })

  it('sorts the highest total first, then by name', () => {
    const totals = totalsByBowler([
      row({ registrationId: 'a', name: 'Zed', amountCents: 5000 }),
      row({ registrationId: 'b', name: 'Amy', amountCents: 5000 }),
      row({ registrationId: 'c', name: 'Moe', amountCents: 9000 }),
    ])
    expect(totals.map((bowler) => bowler.name)).toEqual(['Moe', 'Amy', 'Zed'])
  })

  it('keeps only bowlers at or above the minimum, including a total equal to it', () => {
    const rows = [
      row({ registrationId: 'a', amountCents: 200000 }),
      row({ registrationId: 'b', amountCents: 199999 }),
    ]
    expect(totalsByBowler(rows, 200000).map((bowler) => bowler.registrationId)).toEqual(['a'])
    expect(totalsByBowler(rows, 0)).toHaveLength(2)
  })

  it('returns nothing for no payouts', () => {
    expect(totalsByBowler([])).toEqual([])
  })
})

describe('summarize (PAY-19)', () => {
  it('counts, adds, and splits paid from unpaid', () => {
    expect(
      summarize([
        { amountCents: 10000, paid: true },
        { amountCents: 2500, paid: false },
        { amountCents: 100, paid: false },
      ]),
    ).toEqual({ count: 3, total: '126.00', paidCount: 1, unpaidCount: 2, unpaidTotal: '26.00' })
  })

  it('is all zeros for no payouts', () => {
    expect(summarize([])).toEqual({
      count: 0,
      total: '0.00',
      paidCount: 0,
      unpaidCount: 0,
      unpaidTotal: '0.00',
    })
  })
})
