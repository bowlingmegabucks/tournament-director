import { describe, expect, it } from 'vitest'
import { laneBowlerSchema, lanePageSchema } from './types.ts'

const bowler = {
  registrationId: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
  name: 'Joe Fontaine',
  divisionId: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01',
  divisionName: 'Open',
  average: 212,
  position: '1A',
  pins: 0,
  superSweeper: false,
}

describe('laneBowlerSchema', () => {
  it('accepts a bowler with no average or position', () => {
    expect(laneBowlerSchema.safeParse({ ...bowler, average: null, position: '' }).success).toBe(
      true,
    )
  })

  it('does not carry fields the page must never see (BWL-17)', () => {
    const parsed = laneBowlerSchema.parse({ ...bowler, socialSecurityNumber: '123-45-6789' })

    expect(Object.keys(parsed)).not.toContain('socialSecurityNumber')
  })

  it.each([
    ['a registration id that is not a UUID', { registrationId: 'x' }],
    ['an empty name', { name: '' }],
    ['a fractional average', { average: 1.5 }],
    ['text pins', { pins: 'ten' }],
  ])('rejects %s', (_name, overrides) => {
    expect(laneBowlerSchema.safeParse({ ...bowler, ...overrides }).success).toBe(false)
  })
})

describe('lanePageSchema', () => {
  const page = {
    session: {
      id: '2f6d8b3a-4c55-4d0e-8a11-9b7e5c3d1f02',
      kind: 'squad',
      date: '2026-10-24T09:00:00',
      complete: false,
      startingLane: 1,
      numberOfLanes: 10,
      maxPerPair: 5,
    },
    pairs: [{ firstLane: 1, lanes: [1, 2], capacity: 5, bowlers: [bowler] }],
    unassigned: [],
    other: [],
    divisions: [{ id: bowler.divisionId, number: 1, name: 'Open', entries: 1 }],
  }

  it('accepts a page', () => {
    expect(lanePageSchema.safeParse(page).success).toBe(true)
  })

  it('rejects a session kind that is neither squad nor sweeper', () => {
    expect(
      lanePageSchema.safeParse({ ...page, session: { ...page.session, kind: 'finals' } }).success,
    ).toBe(false)
  })

  it('rejects a negative division count', () => {
    expect(
      lanePageSchema.safeParse({
        ...page,
        divisions: [{ ...page.divisions[0], entries: -1 }],
      }).success,
    ).toBe(false)
  })
})
