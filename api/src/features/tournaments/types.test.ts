import { describe, expect, it } from 'vitest'
import { tournamentDetailSchema, tournamentListSchema, tournamentSchema } from './types.ts'
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
