import { describe, expect, it } from 'vitest'
import {
  completeMessage,
  duplicateNameMessage,
  fullMessage,
  planCreate,
  unusualPercentMessage,
  type CreateFacts,
} from './createPlan.ts'
import type { NewDivision } from './createRequest.ts'

const input: NewDivision = {
  name: 'Juniors',
  gender: null,
  minimumAge: null,
  maximumAge: 17,
  minimumAverage: null,
  maximumAverage: null,
  handicapPercentage: null,
  handicapBase: null,
  maximumHandicapPerGame: null,
}

const open: CreateFacts = {
  completed: false,
  divisions: [
    { number: 1, name: 'Open' },
    { number: 2, name: 'Women' },
  ],
}

describe('planCreate', () => {
  it('numbers the division one more than the highest stored number (DIV-01, D-139)', () => {
    expect(planCreate(open, input, false)).toEqual({ kind: 'create', number: 3 })
  })

  it('numbers up to the smallint limit and refuses the next one', () => {
    const at = (number: number) => ({ completed: false, divisions: [{ number, name: 'A' }] })

    expect(planCreate(at(32766), input, false)).toEqual({ kind: 'create', number: 32767 })
    expect(planCreate(at(32767), input, false)).toEqual({
      kind: 'refused',
      errors: { tournament: fullMessage },
    })
  })

  it('uses the highest number, not the count, when numbers have gaps (D-139)', () => {
    const facts = {
      completed: false,
      divisions: [
        { number: 2, name: 'A' },
        { number: 9, name: 'B' },
      ],
    }
    expect(planCreate(facts, input, false)).toEqual({ kind: 'create', number: 10 })
  })

  it('numbers the first division 1 (DIV-01, D-139)', () => {
    expect(planCreate({ completed: false, divisions: [] }, input, false)).toEqual({
      kind: 'create',
      number: 1,
    })
  })

  it('never goes below 1 when an old row holds 0 or less (DIV-01)', () => {
    const facts = {
      completed: false,
      divisions: [
        { number: 0, name: 'A' },
        { number: -3, name: 'B' },
      ],
    }
    expect(planCreate(facts, input, false)).toEqual({ kind: 'create', number: 1 })
  })

  it('refuses a complete tournament (D-143)', () => {
    expect(planCreate({ ...open, completed: true }, input, false)).toEqual({
      kind: 'refused',
      errors: { tournament: completeMessage },
    })
  })

  it('refuses a complete tournament before it checks the name or the warning (D-129, D-143)', () => {
    const facts = { ...open, completed: true }
    const clash = { ...input, name: 'open', handicapPercentage: 150, handicapBase: 220 }
    expect(planCreate(facts, clash, false)).toEqual({
      kind: 'refused',
      errors: { tournament: completeMessage },
    })
  })

  it.each(['Open', 'open', '  OPEN  '])('refuses the name %j, already used (D-140)', (name) => {
    expect(planCreate(open, { ...input, name }, false)).toEqual({
      kind: 'refused',
      errors: { name: duplicateNameMessage },
    })
  })

  it('refuses a used name before it asks to confirm a percent (D-129)', () => {
    const clash = { ...input, name: 'Open', handicapPercentage: 150, handicapBase: 220 }
    expect(planCreate(open, clash, true)).toMatchObject({ kind: 'refused' })
    expect(planCreate(open, clash, false)).toMatchObject({ kind: 'refused' })
  })

  it('refuses a name that matches a stored one with spaces around it (D-140)', () => {
    const facts = { completed: false, divisions: [{ number: 1, name: '  Open ' }] }
    expect(planCreate(facts, { ...input, name: 'Open' }, false)).toMatchObject({ kind: 'refused' })
  })

  it('accepts a name that only contains a stored one (D-140)', () => {
    expect(planCreate(open, { ...input, name: 'Open Seniors' }, false)).toMatchObject({
      kind: 'create',
    })
  })

  it('warns about a percent over 100 and saves nothing (DIV-08, D-142)', () => {
    const unusual = { ...input, handicapPercentage: 101, handicapBase: 220 }
    expect(planCreate(open, unusual, false)).toEqual({
      kind: 'warn',
      warnings: [{ field: 'handicapPercentage', message: unusualPercentMessage }],
    })
  })

  it('saves a percent over 100 once the director has confirmed (D-142)', () => {
    const unusual = { ...input, handicapPercentage: 110, handicapBase: 220 }
    expect(planCreate(open, unusual, true)).toEqual({ kind: 'create', number: 3 })
  })

  it.each([null, 1, 90, 100])(
    'does not warn about a percent of %s (D-142)',
    (handicapPercentage) => {
      const usual = {
        ...input,
        handicapPercentage,
        handicapBase: handicapPercentage === null ? null : 220,
      }
      expect(planCreate(open, usual, false)).toMatchObject({ kind: 'create' })
    },
  )
})
