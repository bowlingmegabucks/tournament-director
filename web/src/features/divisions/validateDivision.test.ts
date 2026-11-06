import { describe, expect, it } from 'vitest'
import { createDivision } from '../../mocks/data'
import {
  emptyDivisionForm,
  nextDivisionNumber,
  toDivisionChanges,
  toFormValues,
  toNewDivision,
  validateDivision,
  validateDivisionChanges,
} from './validateDivision'
import type { DivisionFormValues } from './types'

const form = (overrides: Partial<DivisionFormValues> = {}): DivisionFormValues => ({
  ...emptyDivisionForm,
  name: 'Open',
  ...overrides,
})

describe('validateDivision', () => {
  it('accepts a name alone (DIV-12)', () => {
    expect(validateDivision(form())).toEqual({})
  })

  it.each([
    ['', 'Name is required'],
    ['   ', 'Name is required'],
    ['x'.repeat(101), 'Name cannot be longer than 100 characters'],
  ])('refuses the name %j (DIV-02)', (name, message) => {
    expect(validateDivision(form({ name }))).toEqual({ name: message })
  })

  it('accepts a name of exactly 100 characters, spaces around it ignored (DIV-02)', () => {
    expect(validateDivision(form({ name: ` ${'x'.repeat(100)} ` }))).toEqual({})
  })

  it.each([
    ['minimumAge', '0', 'Minimum age must be between 1 and 120'],
    ['minimumAge', '121', 'Minimum age must be between 1 and 120'],
    ['maximumAge', '0', 'Maximum age must be between 1 and 120'],
    ['maximumAge', '121', 'Maximum age must be between 1 and 120'],
    ['minimumAverage', '0', 'Minimum average must be between 1 and 300'],
    ['minimumAverage', '301', 'Minimum average must be between 1 and 300'],
    ['maximumAverage', '0', 'Maximum average must be between 1 and 300'],
    ['maximumAverage', '301', 'Maximum average must be between 1 and 300'],
  ] as const)('refuses %s of %s (DIV-04, DIV-06)', (field, value, message) => {
    expect(validateDivision(form({ [field]: value }))[field]).toBe(message)
  })

  it.each([
    ['minimumAge', '1'],
    ['maximumAge', '120'],
    ['minimumAverage', '1'],
    ['maximumAverage', '300'],
  ] as const)('accepts %s of %s at its edge (DIV-04, DIV-06)', (field, value) => {
    expect(validateDivision(form({ [field]: value }))).toEqual({})
  })

  it('says what is wrong with text and with a fraction (D-125)', () => {
    expect(validateDivision(form({ minimumAge: 'abc' })).minimumAge).toBe('Enter a number')
    expect(validateDivision(form({ minimumAge: '1.5' })).minimumAge).toBe('Enter a whole number')
  })

  it.each([
    ['5x', 'Enter a number'],
    ['x5', 'Enter a number'],
    ['5 5', 'Enter a number'],
    ['1.25', 'Enter a whole number'],
    ['.55', 'Enter a whole number'],
    ['-1.5', 'Enter a whole number'],
  ])('says what is wrong with %j (D-125)', (value, message) => {
    expect(validateDivision(form({ minimumAge: value })).minimumAge).toBe(message)
  })

  it('ignores spaces around a number, and reads "5." as 5 (D-125)', () => {
    expect(validateDivision(form({ minimumAge: ' 12 ', maximumAge: '30.' }))).toEqual({})
    expect(toNewDivision(form({ minimumAge: ' 12 ', maximumAge: '30.' }))).toMatchObject({
      minimumAge: 12,
      maximumAge: 30,
    })
  })

  it('keeps the range message when the limit is also above the maximum (DIV-04, DIV-05, DIV-06, DIV-07)', () => {
    expect(validateDivision(form({ minimumAge: '130', maximumAge: '40' })).minimumAge).toBe(
      'Minimum age must be between 1 and 120',
    )
    expect(
      validateDivision(form({ minimumAverage: '350', maximumAverage: '100' })).minimumAverage,
    ).toBe('Minimum average must be between 1 and 300')
  })

  it('refuses a minimum age above the maximum, on the minimum (DIV-05)', () => {
    expect(validateDivision(form({ minimumAge: '60', maximumAge: '40' }))).toEqual({
      minimumAge: 'Minimum age must be less than or equal to maximum age',
    })
    expect(validateDivision(form({ minimumAge: '50', maximumAge: '50' }))).toEqual({})
  })

  it('refuses a minimum average above the maximum, on the minimum (DIV-07)', () => {
    expect(validateDivision(form({ minimumAverage: '200', maximumAverage: '150' }))).toEqual({
      minimumAverage: 'Minimum average must be less than or equal to maximum average',
    })
    expect(validateDivision(form({ minimumAverage: '180', maximumAverage: '180' }))).toEqual({})
  })

  it('keeps the range message when a limit has a message of its own (DIV-05)', () => {
    expect(validateDivision(form({ minimumAge: '0', maximumAge: '-1' })).minimumAge).toBe(
      'Minimum age must be between 1 and 120',
    )
  })

  it.each([
    ['0', 'Handicap percentage must be at least 1, or leave it blank'],
    ['1000', 'Handicap percentage cannot be more than 999'],
    ['90.5', 'Enter a whole number'],
  ])('refuses a percentage of %s (DIV-08)', (handicapPercentage, message) => {
    expect(validateDivision(form({ handicapPercentage, handicapBase: '220' }))).toEqual({
      handicapPercentage: message,
    })
  })

  it.each(['1', '90', '100', '110', '999'])(
    'accepts a percentage of %s (DIV-08, D-142)',
    (value) => {
      expect(validateDivision(form({ handicapPercentage: value, handicapBase: '220' }))).toEqual({})
    },
  )

  it('wants a base with a percentage, and a percentage with a base (DIV-09)', () => {
    expect(validateDivision(form({ handicapPercentage: '90' }))).toEqual({
      handicapBase: 'Handicap base is required with a handicap percentage',
    })
    expect(validateDivision(form({ handicapBase: '220' }))).toEqual({
      handicapPercentage: 'Handicap percentage is required with a handicap base',
    })
  })

  it.each([
    ['-1', 'Handicap base must be between 0 and 300'],
    ['301', 'Handicap base must be between 0 and 300'],
  ])('refuses a base of %s (DIV-10)', (handicapBase, message) => {
    expect(validateDivision(form({ handicapPercentage: '90', handicapBase }))).toEqual({
      handicapBase: message,
    })
  })

  it.each(['0', '300'])('accepts a base of %s with a percentage (DIV-10)', (handicapBase) => {
    expect(validateDivision(form({ handicapPercentage: '90', handicapBase }))).toEqual({})
  })

  it.each([
    ['0', 'Maximum handicap per game must be between 1 and 300'],
    ['301', 'Maximum handicap per game must be between 1 and 300'],
  ])('refuses a cap of %s (DIV-11)', (maximumHandicapPerGame, message) => {
    const values = form({ handicapPercentage: '90', handicapBase: '220', maximumHandicapPerGame })
    expect(validateDivision(values)).toEqual({ maximumHandicapPerGame: message })
  })

  it('accepts a cap of 1 and of 300 with a base and percentage (DIV-11)', () => {
    for (const cap of ['1', '300']) {
      const values = form({
        handicapPercentage: '90',
        handicapBase: '220',
        maximumHandicapPerGame: cap,
      })
      expect(validateDivision(values)).toEqual({})
    }
  })

  it('keeps the cap range message when there is no base and percentage (DIV-11)', () => {
    expect(validateDivision(form({ maximumHandicapPerGame: '0' }))).toEqual({
      maximumHandicapPerGame: 'Maximum handicap per game must be between 1 and 300',
    })
  })

  it('refuses a cap with no base and percentage (DIV-11)', () => {
    const message = 'Maximum handicap per game is allowed only with a handicap percentage and base'
    expect(validateDivision(form({ maximumHandicapPerGame: '40' }))).toEqual({
      maximumHandicapPerGame: message,
    })
    expect(
      validateDivision(form({ handicapPercentage: '90', maximumHandicapPerGame: '40' })),
    ).toMatchObject({ maximumHandicapPerGame: message })
  })
})

describe('toNewDivision', () => {
  it('sends blank boxes as null and trims the name (DIV-12)', () => {
    expect(toNewDivision(form({ name: '  Open ' }))).toEqual({
      name: 'Open',
      gender: null,
      minimumAge: null,
      maximumAge: null,
      minimumAverage: null,
      maximumAverage: null,
      handicapPercentage: null,
      handicapBase: null,
      maximumHandicapPerGame: null,
    })
  })

  it('sends the numbers as numbers and the percent as typed (DIV-08, D-141)', () => {
    expect(
      toNewDivision(
        form({
          gender: 'Female',
          minimumAge: '50',
          maximumAge: '120',
          minimumAverage: '100',
          maximumAverage: '300',
          handicapPercentage: '90',
          handicapBase: '0',
          maximumHandicapPerGame: '40',
        }),
      ),
    ).toEqual({
      name: 'Open',
      gender: 'Female',
      minimumAge: 50,
      maximumAge: 120,
      minimumAverage: 100,
      maximumAverage: 300,
      handicapPercentage: 90,
      handicapBase: 0,
      maximumHandicapPerGame: 40,
    })
  })
})

describe('nextDivisionNumber', () => {
  it('is one more than the highest number, not the count (DIV-01, D-139)', () => {
    const divisions = [createDivision({ number: 2 }), createDivision({ number: 9 })]
    expect(nextDivisionNumber(divisions)).toBe(10)
  })

  it('is 1 when there are none, and never below 1 for an old row of 0 (DIV-01, D-139)', () => {
    expect(nextDivisionNumber([])).toBe(1)
    expect(
      nextDivisionNumber([createDivision({ number: 0 }), createDivision({ number: -2 })]),
    ).toBe(1)
  })
})

describe('toFormValues', () => {
  it('turns a stored division into text boxes, with blank for not set (DIV-12)', () => {
    expect(
      toFormValues(
        createDivision({
          name: 'Seniors',
          gender: 'Female',
          minimumAge: 50,
          maximumAge: null,
          minimumAverage: 0,
          maximumAverage: 200,
          handicapPercentage: 90,
          handicapBase: 0,
          maximumHandicapPerGame: null,
        }),
      ),
    ).toEqual({
      name: 'Seniors',
      gender: 'Female',
      minimumAge: '50',
      maximumAge: '',
      minimumAverage: '0',
      maximumAverage: '200',
      handicapPercentage: '90',
      handicapBase: '0',
      maximumHandicapPerGame: '',
    })
  })

  it('shows any gender as the empty choice', () => {
    expect(toFormValues(createDivision({ gender: null })).gender).toBe('')
  })
})

describe('validateDivisionChanges (D-147)', () => {
  const start = form({ name: 'Open', minimumAge: '40', maximumAge: '60' })

  it('says nothing about a box the director did not change, even when its stored value breaks a rule', () => {
    const odd = form({ name: 'Open', minimumAge: '60', maximumAge: '40' })

    expect(validateDivisionChanges(odd, { ...odd, name: 'Main' })).toEqual({})
  })

  it('checks a box the director changed', () => {
    expect(validateDivisionChanges(start, { ...start, name: '' })).toEqual({
      name: 'Name is required',
    })
  })

  it('shows the pair message on the minimum when the maximum was changed (DIV-05)', () => {
    expect(validateDivisionChanges(start, { ...start, maximumAge: '30' })).toEqual({
      minimumAge: 'Minimum age must be less than or equal to maximum age',
    })
  })

  it('shows the averages pair the same way (DIV-07)', () => {
    const averaged = form({ name: 'Open', minimumAverage: '150', maximumAverage: '200' })

    expect(validateDivisionChanges(averaged, { ...averaged, minimumAverage: '210' })).toEqual({
      minimumAverage: 'Minimum average must be less than or equal to maximum average',
    })
  })

  it('shows the handicap messages when one of the three boxes was changed (DIV-09, DIV-11)', () => {
    const scratch = form({ name: 'Open' })

    expect(validateDivisionChanges(scratch, { ...scratch, handicapPercentage: '80' })).toEqual({
      handicapBase: 'Handicap base is required with a handicap percentage',
    })
    expect(validateDivisionChanges(scratch, { ...scratch, maximumHandicapPerGame: '30' })).toEqual({
      maximumHandicapPerGame:
        'Maximum handicap per game is allowed only with a handicap percentage and base',
    })
  })

  it('passes a valid change', () => {
    expect(validateDivisionChanges(start, { ...start, maximumAge: '70' })).toEqual({})
  })
})

describe('toDivisionChanges (D-147)', () => {
  const start = form({ name: 'Open', gender: 'Female', minimumAge: '40', handicapPercentage: '90' })

  it('holds only the boxes that differ from the start, as the API takes them', () => {
    expect(
      toDivisionChanges(start, {
        ...start,
        name: '  Main ',
        gender: '',
        minimumAge: '45',
        handicapPercentage: '',
      }),
    ).toEqual({ name: 'Main', gender: null, minimumAge: 45, handicapPercentage: null })
  })

  it('is empty when nothing changed', () => {
    expect(toDivisionChanges(start, { ...start })).toEqual({})
  })
})
