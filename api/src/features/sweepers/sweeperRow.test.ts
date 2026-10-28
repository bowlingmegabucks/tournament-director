import { describe, expect, it } from 'vitest'
import type { SessionRow } from '../../shared/sessions.ts'
import { toSweeper, type DivisionPins } from './sweeperRow.ts'

const decimal = (value: number) => ({ toNumber: () => value })

function createRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: '3f2c9d1e-5b7a-4c68-9e0d-1a2b3c4d5e6f',
    date: new Date('2026-10-24T18:00:00.000Z'),
    maxPerPair: 4,
    startingLane: 1,
    numberOfLanes: 12,
    complete: false,
    cashRatio: decimal(4),
    finalsRatio: null,
    squadEntryFee: null,
    sweeperEntryFee: decimal(25),
    games: 3,
    ...overrides,
  }
}

const openId = '0b7e1c2a-4d5f-4a60-8b91-aaaaaaaaaaa1'
const womenId = '0b7e1c2a-4d5f-4a60-8b91-aaaaaaaaaaa2'
const scratchId = '0b7e1c2a-4d5f-4a60-8b91-aaaaaaaaaaa3'

function divisions(
  open: DivisionPins['bonusPinsPerGame'],
  women: DivisionPins['bonusPinsPerGame'],
  scratch: DivisionPins['bonusPinsPerGame'],
): DivisionPins[] {
  return [
    { divisionId: openId, divisionName: 'Open', bonusPinsPerGame: open },
    { divisionId: womenId, divisionName: 'Women', bonusPinsPerGame: women },
    { divisionId: scratchId, divisionName: 'Scratch', bonusPinsPerGame: scratch },
  ]
}

describe('toSweeper', () => {
  it("maps the sweeper's own fee, games, cash ratio, and lanes (SQD-22, D-43)", () => {
    const result = toSweeper(createRow({ complete: true }), [])

    expect(result.success && result.data).toEqual({
      id: '3f2c9d1e-5b7a-4c68-9e0d-1a2b3c4d5e6f',
      date: '2026-10-24T18:00:00',
      complete: true,
      startingLane: 1,
      numberOfLanes: 12,
      maxPerPair: 4,
      entryFee: 25,
      games: 3,
      cashRatio: 4,
      bonusPins: [],
    })
  })

  it('lists only divisions with bonus pins other than 0, in the order given (SQD-22, DIV-14, D-45)', () => {
    const result = toSweeper(createRow(), divisions(10, 6, 0))

    expect(result.success && result.data.bonusPins).toEqual([
      { divisionId: openId, divisionName: 'Open', bonusPinsPerGame: 10 },
      { divisionId: womenId, divisionName: 'Women', bonusPinsPerGame: 6 },
    ])
  })

  it('leaves out a division whose pins are NULL (SCR-09, D-45)', () => {
    const result = toSweeper(createRow(), divisions(null, null, 5))

    expect(result.success && result.data.bonusPins).toEqual([
      { divisionId: scratchId, divisionName: 'Scratch', bonusPinsPerGame: 5 },
    ])
  })

  it('has an empty list when every division counts as 0 (D-45)', () => {
    const result = toSweeper(createRow(), divisions(null, null, 0))

    expect(result.success && result.data.bonusPins).toEqual([])
  })

  it('lists nothing when the sweeper has no stored pin rows (SCR-09, D-45)', () => {
    const result = toSweeper(createRow(), [])

    expect(result.success && result.data.bonusPins).toEqual([])
  })

  it('keeps negative pins, which are not 0 (D-45)', () => {
    const result = toSweeper(createRow(), divisions(-5, null, null))

    expect(result.success && result.data.bonusPins).toHaveLength(1)
  })

  it.each([
    ['no fee', { sweeperEntryFee: null }],
    ['no games', { games: null }],
    ['no cash ratio', { cashRatio: null }],
    ['an id that is not a UUID', { id: 'not-a-uuid' }],
    ['an unreadable date', { date: new Date('nonsense') }],
  ])('rejects a sweeper with %s (SQD-11, SQD-12, D-42)', (_label, override) => {
    expect(toSweeper(createRow(override), []).success).toBe(false)
  })

  it('keeps a row that SQD-10 to SQD-12 would refuse on save (D-42)', () => {
    const result = toSweeper(
      createRow({ sweeperEntryFee: decimal(0), games: 0, numberOfLanes: 3 }),
      [],
    )

    expect(result.success).toBe(true)
  })
})
