import { describe, expect, it } from 'vitest'
import type { SessionRow } from '../../shared/sessions.ts'
import { toSquad, type TournamentDefaults } from './squadRow.ts'

const defaults: TournamentDefaults = { entryFee: 50, finalsRatio: 7, cashRatio: 5, games: 3 }
const decimal = (value: number) => ({ toNumber: () => value })

function createRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: '3f2c9d1e-5b7a-4c68-9e0d-1a2b3c4d5e6f',
    date: new Date('2026-10-24T09:00:00.000Z'),
    maxPerPair: 4,
    startingLane: 1,
    numberOfLanes: 24,
    complete: false,
    cashRatio: null,
    finalsRatio: null,
    squadEntryFee: null,
    sweeperEntryFee: null,
    games: null,
    ...overrides,
  }
}

describe('toSquad', () => {
  it('uses the tournament fee and ratios when the squad sets none, and flags nothing (TRN-12, D-43)', () => {
    const result = toSquad(createRow(), defaults)

    expect(result.success && result.data).toEqual({
      id: '3f2c9d1e-5b7a-4c68-9e0d-1a2b3c4d5e6f',
      date: '2026-10-24T09:00:00',
      complete: false,
      startingLane: 1,
      numberOfLanes: 24,
      maxPerPair: 4,
      entryFee: 50,
      entryFeeOverridden: false,
      finalsRatio: 7,
      finalsRatioOverridden: false,
      cashRatio: 5,
      cashRatioOverridden: false,
      games: 3,
    })
  })

  it('uses the squad value and flags it when the squad overrides (TRN-12, D-43)', () => {
    const result = toSquad(
      createRow({
        squadEntryFee: decimal(60),
        finalsRatio: decimal(8),
        cashRatio: decimal(4.5),
      }),
      defaults,
    )

    expect(result.success && result.data).toMatchObject({
      entryFee: 60,
      entryFeeOverridden: true,
      finalsRatio: 8,
      finalsRatioOverridden: true,
      cashRatio: 4.5,
      cashRatioOverridden: true,
      games: 3,
    })
  })

  it('takes the games from the tournament, since a squad never sets its own (TRN-04)', () => {
    const result = toSquad(createRow({ games: 9 }), { ...defaults, games: 5 })

    expect(result.success && result.data).toMatchObject({ games: 5 })
  })

  it('flags each override on its own (D-43)', () => {
    const result = toSquad(createRow({ finalsRatio: decimal(8) }), defaults)

    expect(result.success && result.data).toMatchObject({
      entryFeeOverridden: false,
      finalsRatioOverridden: true,
      cashRatioOverridden: false,
    })
  })

  it('reads a free squad: a fee of 0 is an override, not a missing value (TRN-12)', () => {
    const result = toSquad(createRow({ squadEntryFee: decimal(0) }), defaults)

    expect(result.success && result.data).toMatchObject({ entryFee: 0, entryFeeOverridden: true })
  })

  it('shows the complete status (SQD-21)', () => {
    const result = toSquad(createRow({ complete: true }), defaults)

    expect(result.success && result.data.complete).toBe(true)
  })

  it('keeps a row that SQD-01 to SQD-08 would refuse on save (D-42)', () => {
    const result = toSquad(
      createRow({ numberOfLanes: 3, startingLane: 2, maxPerPair: 0 }),
      defaults,
    )

    expect(result.success).toBe(true)
  })

  it.each([
    ['an id that is not a UUID', { id: 'not-a-uuid' }],
    ['an unreadable date', { date: new Date('nonsense') }],
  ])('rejects a row with %s (D-42)', (_label, override) => {
    expect(toSquad(createRow(override), defaults).success).toBe(false)
  })
})
