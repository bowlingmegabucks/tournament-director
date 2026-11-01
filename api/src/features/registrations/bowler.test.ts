import { describe, expect, it } from 'vitest'
import { sampleRequest } from '../../test/registrationRequests.ts'
import {
  genderOf,
  mergeBowler,
  normalizePhone,
  normalizeZip,
  toBowlerPatch,
  toNewBowler,
  type StoredBowler,
} from './bowler.ts'
import { createCommonBowler } from './bowler.testData.ts'
import type { BowlerInput } from './request.ts'

function bowlerInput(overrides: Partial<BowlerInput> = {}): BowlerInput {
  return { ...sampleRequest().registration.bowler, ...overrides }
}

describe('normalizePhone (BWL-07a)', () => {
  it.each([
    ['919-555-1212', '9195551212'],
    ['(919) 555-1212', '9195551212'],
    ['+1 919 555 1212', '9195551212'],
    ['1-919-555-1212', '9195551212'],
    ['919-555-1212 ext 45', '9195551212'],
    ['919-555-1212 x45', '9195551212'],
    ['555-1212', ''],
    ['919-555-1212x45', '9195551212'],
    ['919-555-1212 extension 45  ', '9195551212'],
    ['x45 919-555-1212', ''],
    ['1955512123', '1955512123'],
    ['29195551212', ''],
    ['19195551212', '9195551212'],
    ['', ''],
  ])('turns %j into %j', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected)
  })
})

describe('normalizeZip (BWL-04)', () => {
  it.each([
    ['27601', '27601'],
    ['27601-1234', '276011234'],
    ['2760', ''],
    ['abcde', ''],
  ])('turns %j into %j', (raw, expected) => {
    expect(normalizeZip(raw)).toBe(expected)
  })
})

describe('genderOf (API-10, D-113)', () => {
  it.each([
    ['F', 'Female'],
    ['f', 'Female'],
    ['M', 'Male'],
    ['x', 'Male'],
    [' f ', 'Female'],
    ['', 'Male'],
  ])('maps %j to %s', (raw, expected) => {
    expect(genderOf(raw)).toBe(expected)
  })
})

describe('a new bowler', () => {
  it('stores the fields sent, with digits-only phone and zip', () => {
    const bowler = toNewBowler(bowlerInput())

    expect(bowler).toEqual({
      firstName: 'Joe',
      middleInitial: 'J',
      lastName: 'Fontaine',
      suffix: '',
      street: '1 Main St',
      city: 'Raleigh',
      state: 'NC',
      zipCode: '27601',
      email: 'joe@example.com',
      phoneNumber: '9195551212',
      usbcId: '1234-56789',
      dateOfBirth: '1970-01-31',
      gender: 'Male',
    })
  })

  it('is Male when no gender comes, and Female only for "F" (API-10, D-113)', () => {
    expect(toNewBowler(bowlerInput({ gender: null })).gender).toBe('Male')
    expect(toNewBowler(bowlerInput({ gender: undefined })).gender).toBe('Male')
    expect(toNewBowler(bowlerInput({ gender: '' })).gender).toBe('Male')
    expect(toNewBowler(bowlerInput({ gender: 'F' })).gender).toBe('Female')
  })

  it('has no birth date when none comes', () => {
    expect(toNewBowler(bowlerInput({ dateOfBirth: null })).dateOfBirth).toBeNull()
  })
})

describe('a new bowler with only the required fields', () => {
  it('has empty text for the rest, an unknown birth date, and Male (D-113)', () => {
    const base = bowlerInput()
    const bowler = toNewBowler({
      firstName: base.firstName,
      lastName: base.lastName,
      address: { street: '', city: '', state: '', zipCode: '' },
      email: base.email,
      usbcId: base.usbcId,
    })

    expect(bowler).toEqual({
      firstName: 'Joe',
      middleInitial: '',
      lastName: 'Fontaine',
      suffix: '',
      street: '',
      city: '',
      state: '',
      zipCode: '',
      email: 'joe@example.com',
      phoneNumber: '',
      usbcId: '1234-56789',
      dateOfBirth: null,
      gender: 'Male',
    })
  })
})

describe('a returning bowler (REG-07, REG-14, BWL-16a, D-05)', () => {
  const stored: StoredBowler = createCommonBowler()

  it('keeps every stored value the request leaves out or sends empty', () => {
    const patch = toBowlerPatch(
      bowlerInput({
        middleInitial: null,
        suffix: '',
        phoneNumber: '   ',
        dateOfBirth: null,
        gender: null,
        address: { street: '', city: '', state: '', zipCode: '' },
      }),
    )

    expect(patch).not.toHaveProperty('middleInitial')
    expect(patch).not.toHaveProperty('suffix')
    expect(patch).not.toHaveProperty('phoneNumber')
    expect(patch).not.toHaveProperty('dateOfBirth')
    expect(patch).not.toHaveProperty('gender')
    expect(patch).not.toHaveProperty('street')
    expect(patch).not.toHaveProperty('zipCode')
    const merged = mergeBowler(stored, patch)
    expect(merged.suffix).toBe(stored.suffix)
    expect(merged.phoneNumber).toBe(stored.phoneNumber)
    expect(merged.dateOfBirth).toBe(stored.dateOfBirth)
    expect(merged.gender).toBe(stored.gender)
    expect(merged.street).toBe(stored.street)
  })

  it('overwrites a field the request sends with a value', () => {
    const patch = toBowlerPatch(
      bowlerInput({ email: 'new@example.com', gender: 'F', phoneNumber: '(919) 555-0000' }),
    )

    const merged = mergeBowler(stored, patch)

    expect(merged.email).toBe('new@example.com')
    expect(merged.gender).toBe('Female')
    expect(merged.phoneNumber).toBe('9195550000')
  })

  it('treats text of only spaces as not sent', () => {
    const patch = toBowlerPatch(bowlerInput({ suffix: '   ', gender: '  ', dateOfBirth: ' ' }))
    expect(patch).not.toHaveProperty('suffix')
    expect(patch).not.toHaveProperty('gender')
    expect(patch).not.toHaveProperty('dateOfBirth')
  })

  it('trims the text it stores', () => {
    expect(toBowlerPatch(bowlerInput({ suffix: ' Jr ' })).suffix).toBe('Jr')
  })
})
