import { describe, expect, it } from 'vitest'
import { planCreate, unknownDivisionMessage, type CreateFacts } from './createPlan.ts'
import type { NewSweeper } from './createRequest.ts'

const open = '11111111-1111-4111-8111-111111111111'
const other = '99999999-9999-4999-8999-999999999999'

const facts: CreateFacts = {
  completed: false,
  startDate: '2026-10-24',
  endDate: '2026-10-25',
  divisionIds: new Set([open]),
}

const input = (date: string, bonusPins: Record<string, number> = {}): NewSweeper => ({
  date,
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
  bonusPins,
})

describe('planCreate (sweeper)', () => {
  it.each(['2026-10-24T00:00:00', '2026-10-25T23:59:00'])('creates on %s (SQD-10)', (date) => {
    expect(planCreate(facts, input(date))).toEqual({ kind: 'create' })
  })

  it('creates with pins for the tournament’s divisions, 0 included (SQD-13)', () => {
    expect(planCreate(facts, input('2026-10-24T18:00:00', { [open]: 10 }))).toEqual({
      kind: 'create',
    })
  })

  it('says "Sweeper" in the date messages (SQD-10)', () => {
    expect(planCreate(facts, input('2026-10-23T23:59:00'))).toEqual({
      kind: 'refused',
      errors: { date: 'Sweeper date must be after tournament start' },
    })
    expect(planCreate(facts, input('2026-10-26T00:00:00'))).toEqual({
      kind: 'refused',
      errors: { date: 'Sweeper date must be before tournament end' },
    })
  })

  it('refuses a complete tournament first, before the date and the divisions (SQD-10, D-171)', () => {
    expect(
      planCreate({ ...facts, completed: true }, input('2026-10-01T00:00:00', { [other]: 5 })),
    ).toEqual({
      kind: 'refused',
      errors: { tournament: 'This tournament is complete and cannot be changed' },
    })
  })

  it('refuses a division that is not in the tournament, even with 0 pins (D-177)', () => {
    expect(planCreate(facts, input('2026-10-24T18:00:00', { [open]: 10, [other]: 0 }))).toEqual({
      kind: 'refused',
      errors: { bonusPins: unknownDivisionMessage },
    })
  })

  it('refuses the date before the divisions (D-177)', () => {
    expect(planCreate(facts, input('2026-10-20T18:00:00', { [other]: 5 }))).toMatchObject({
      errors: { date: 'Sweeper date must be after tournament start' },
    })
  })
})
