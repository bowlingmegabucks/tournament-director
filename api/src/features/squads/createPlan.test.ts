import { describe, expect, it } from 'vitest'
import { planCreate, type CreateFacts } from './createPlan.ts'
import type { NewSquad } from './createRequest.ts'

const open: CreateFacts = { completed: false, startDate: '2026-10-24', endDate: '2026-10-25' }

const input = (date: string): NewSquad => ({
  date,
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: null,
  finalsRatio: null,
  cashRatio: null,
})

describe('planCreate', () => {
  it.each(['2026-10-24T00:00:00', '2026-10-24T09:00:00', '2026-10-25T23:59:00'])(
    'creates a squad on %s, inside the tournament dates (SQD-03)',
    (date) => {
      expect(planCreate(open, input(date))).toEqual({ kind: 'create' })
    },
  )

  it('refuses the minute before the start day (SQD-03)', () => {
    expect(planCreate(open, input('2026-10-23T23:59:00'))).toEqual({
      kind: 'refused',
      errors: { date: 'Squad date must be after tournament start' },
    })
  })

  it('refuses the first minute after the end day (SQD-03)', () => {
    expect(planCreate(open, input('2026-10-26T00:00:00'))).toEqual({
      kind: 'refused',
      errors: { date: 'Squad date must be before tournament end' },
    })
  })

  it('accepts any time on a one-day tournament (SQD-03)', () => {
    const oneDay = { ...open, endDate: '2026-10-24' }
    expect(planCreate(oneDay, input('2026-10-24T23:59:00'))).toEqual({ kind: 'create' })
  })

  it('refuses a complete tournament before it looks at the date (D-171)', () => {
    expect(planCreate({ ...open, completed: true }, input('2026-12-01T09:00:00'))).toEqual({
      kind: 'refused',
      errors: { tournament: 'This tournament is complete and cannot be changed' },
    })
  })
})
