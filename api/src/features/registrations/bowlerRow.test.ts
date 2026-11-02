import { describe, expect, it } from 'vitest'
import {
  dateColumn,
  genderFromColumn,
  genderToColumn,
  newColumns,
  patchColumns,
  toStoredBowler,
} from './bowlerRow.ts'

describe('genderFromColumn (database.md)', () => {
  it.each([
    [0, 'Male'],
    [1, 'Female'],
    [null, null],
    [2, null],
  ])('reads %s as %s', (value, expected) => {
    expect(genderFromColumn(value)).toBe(expected)
  })
})

describe('toStoredBowler', () => {
  const row = {
    id: 'b',
    firstName: 'Ray',
    middleInitial: 'Q',
    lastName: 'Baptiste',
    suffix: '',
    street: '1 Main St',
    city: 'Boston',
    state: 'MA',
    zipCode: '02101',
    email: 'x@example.com',
    phoneNumber: '6175550100',
    usbcId: '1190-55820',
    dateOfBirth: new Date('1980-01-01T00:00:00Z'),
    gender: 1,
  }

  it('maps the columns and reads the birth date as a plain date', () => {
    expect(toStoredBowler(row)).toEqual({ ...row, dateOfBirth: '1980-01-01', gender: 'Female' })
  })

  it('reads no birth date, or an unreadable one, as null', () => {
    expect(toStoredBowler({ ...row, dateOfBirth: null }).dateOfBirth).toBeNull()
    expect(toStoredBowler({ ...row, dateOfBirth: new Date('nope') }).dateOfBirth).toBeNull()
  })
})

describe('columns written to the Bowlers table', () => {
  it('turns a patch into only the columns it names (D-05)', () => {
    const columns = patchColumns({ email: 'a@b.com', gender: 'Female', dateOfBirth: '1970-01-31' })

    expect(columns).toMatchObject({
      email: 'a@b.com',
      gender: 1,
      dateOfBirth: new Date('1970-01-31T00:00:00Z'),
    })
    expect(columns.firstName).toBeUndefined()
    expect(columns.phoneNumber).toBeUndefined()
    expect(columns).not.toHaveProperty('socialSecurityNumber')
  })

  it('writes every column for a new bowler, with Male as 0 and no birth date as null', () => {
    const columns = newColumns({
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
      usbcId: '1-2',
      dateOfBirth: null,
      gender: 'Male',
    })

    expect(columns).toEqual({
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
      usbcId: '1-2',
      dateOfBirth: null,
      gender: 0,
    })
  })

  it('writes an unknown gender as null', () => {
    expect(genderToColumn(null)).toBeNull()
    expect(genderToColumn('Male')).toBe(0)
    expect(genderToColumn('Female')).toBe(1)
  })

  it('writes a birth date as midnight UTC', () => {
    expect(dateColumn('1980-05-06')?.toISOString()).toBe('1980-05-06T00:00:00.000Z')
    expect(dateColumn(null)).toBeNull()
  })
})
