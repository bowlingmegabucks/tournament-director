import { describe, expect, it } from 'vitest'
import { genderFromColumn, toStoredBowler } from './prismaWriter.ts'

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
