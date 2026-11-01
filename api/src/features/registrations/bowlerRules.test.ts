import { describe, expect, it } from 'vitest'
import { createCommonBowler } from './bowler.testData.ts'
import { checkBowler, isValidPhone } from './bowlerRules.ts'

const today = '2026-11-01'

function descriptions(overrides: Parameters<typeof createCommonBowler>[0], rawPhone?: string) {
  return checkBowler(createCommonBowler(overrides), { today, rawPhone }).map((f) => f.description)
}

describe('checkBowler', () => {
  it('passes a complete bowler', () => {
    expect(descriptions({})).toEqual([])
  })

  it('needs a first and last name (BWL-01, BWL-02)', () => {
    expect(descriptions({ firstName: '', lastName: '' })).toEqual([
      'First Name is Required',
      'Last Name is Required',
    ])
  })

  it('allows a middle initial of at most one character (BWL-03)', () => {
    expect(descriptions({ middleInitial: '' })).toEqual([])
    expect(descriptions({ middleInitial: 'Jo' })).toEqual([
      'Middle Initial must only be 1 character',
    ])
  })

  it('needs city, a two-letter state, and a zip when there is a street (BWL-04)', () => {
    expect(descriptions({ city: '', state: 'N', zipCode: '' })).toEqual([
      'City is Required when Street is given',
      'State must be Postal Abbreviation',
      'Valid Zip Code required when Street is given',
    ])
    expect(descriptions({ state: '' })).toEqual([
      'State must be Postal Abbreviation',
      'State is required when Street is given',
    ])
  })

  it('does not check the zip when there is no street (BWL-04)', () => {
    expect(descriptions({ street: '', zipCode: '' })).toEqual([])
  })

  it('needs a state when there is a city but no street (BWL-05)', () => {
    expect(descriptions({ street: '', state: '' })).toEqual(['State required when City is given'])
  })

  it('refuses a bad email, and allows none (BWL-06)', () => {
    expect(descriptions({ email: 'nope' })).toEqual(['Invalid Email'])
    expect(descriptions({ email: '' })).toEqual([])
  })

  it('checks the phone as sent (BWL-07)', () => {
    expect(descriptions({}, '12')).toEqual(['Invalid Phone Number'])
    expect(descriptions({}, '919-555-1212')).toEqual([])
    expect(descriptions({}, '  ')).toEqual([])
    expect(descriptions({}, undefined)).toEqual([])
  })

  it.each([
    ['919-555-1212', true],
    ['(919) 555-1212', false],
    ['+1 919 555 1212', true],
    ['919.555.1212 ext. 12', true],
    ['9195551', false],
    ['919-555-1212 x1234567', false],
  ])('accepts the legacy phone pattern for %j: %s (BWL-07)', (raw, expected) => {
    expect(isValidPhone(raw)).toBe(expected)
  })

  it('needs a birth date before today (BWL-08)', () => {
    expect(descriptions({ dateOfBirth: '2026-11-01' })).toEqual([
      'Date of Birth must be in the past',
    ])
    expect(descriptions({ dateOfBirth: '2026-10-31' })).toEqual([])
    expect(descriptions({ dateOfBirth: null })).toEqual([])
  })

  it('needs a USBC id like 1234-56789 when given (BWL-10)', () => {
    expect(descriptions({ usbcId: '123456789' })).toEqual(['Invalid USBC Id'])
    expect(descriptions({ usbcId: '12-3-4' })).toEqual(['Invalid USBC Id'])
    expect(descriptions({ usbcId: '12-34' })).toEqual([])
  })

  it('marks every failure as a validation error', () => {
    const failures = checkBowler(createCommonBowler({ firstName: '' }), { today, rawPhone: null })
    expect(failures.every((failure) => failure.kind === 'validation')).toBe(true)
  })
})
