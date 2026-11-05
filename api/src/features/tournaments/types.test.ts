import { describe, expect, it } from 'vitest'
import {
  tournamentDetailSchema,
  tournamentListSchema,
  tournamentSchema,
  tournamentSettingsSchema,
  tournamentSettingsViewSchema,
} from './types.ts'
import { createTournament } from '../../test/factories.ts'

describe('tournament schema', () => {
  it('accepts the vendor shape (TRN-11)', () => {
    expect(tournamentSchema.safeParse(createTournament()).success).toBe(true)
  })

  it.each([
    ['an id that is not a UUID', { id: 'abc' }],
    ['an empty name', { name: '' }],
    ['a start date that is not a date', { startDate: '10/23/2026' }],
    ['an end date that is not a date', { endDate: 'tomorrow' }],
    ['a fee of zero', { entryFee: 0 }],
    ['a negative fee', { entryFee: -5 }],
    ['a fee that is text', { entryFee: '50.00' }],
    ['an empty bowling center', { bowlingCenter: '' }],
  ])('rejects %s', (_label, override) => {
    expect(tournamentSchema.safeParse({ ...createTournament(), ...override }).success).toBe(false)
  })

  it('wraps the list and the detail as the vendor routes do (API-03, API-04)', () => {
    const tournament = createTournament()

    expect(tournamentListSchema.safeParse({ tournaments: [tournament] }).success).toBe(true)
    expect(tournamentListSchema.safeParse([tournament]).success).toBe(false)
    const arrays = { divisions: [], squads: [], sweepers: [] }
    expect(
      tournamentDetailSchema.safeParse({ tournament: { ...tournament, ...arrays } }).success,
    ).toBe(true)
    expect(
      tournamentDetailSchema.safeParse({ tournament: { ...tournament, divisions: [] } }).success,
    ).toBe(false)
    expect(tournamentDetailSchema.safeParse({ tournament }).success).toBe(false)
    expect(tournamentDetailSchema.safeParse(tournament).success).toBe(false)
    expect(tournamentListSchema.safeParse({}).success).toBe(false)
    expect(tournamentDetailSchema.safeParse({}).success).toBe(false)
  })
})

describe('tournament settings schema (TRN-21)', () => {
  const settings = { games: 5, finalsRatio: 8, cashRatio: 5, superSweeperCashRatio: 0 }

  it('accepts games and ratios, including a legacy super sweeper ratio of 0 (D-17)', () => {
    expect(tournamentSettingsSchema.safeParse(settings).success).toBe(true)
  })

  it.each([0, 2.5, '5'])('rejects games of %j', (games) => {
    expect(tournamentSettingsSchema.safeParse({ ...settings, games }).success).toBe(false)
  })

  it('accepts one game', () => {
    expect(tournamentSettingsSchema.safeParse({ ...settings, games: 1 }).success).toBe(true)
  })
})

describe('tournament settings view schema (D-131)', () => {
  const settings = { games: 5, finalsRatio: 8, cashRatio: 5, superSweeperCashRatio: 0 }

  it.each([true, false])('accepts completed %j', (completed) => {
    expect(tournamentSettingsViewSchema.safeParse({ ...settings, completed }).success).toBe(true)
  })

  it('needs the flag to be a boolean', () => {
    expect(tournamentSettingsViewSchema.safeParse({ ...settings, completed: 'yes' }).success).toBe(
      false,
    )
    expect(tournamentSettingsViewSchema.safeParse(settings).success).toBe(false)
  })
})
