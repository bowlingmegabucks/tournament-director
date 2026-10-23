import { describe, expect, it } from 'vitest'
import { toDivision, type DivisionRow } from './divisionRow.ts'

function createRow(overrides: Partial<DivisionRow> = {}): DivisionRow {
  return {
    id: '3f2c9d1e-5b7a-4c68-9e0d-1a2b3c4d5e6f',
    name: 'Open',
    number: 1,
    minimumAge: null,
    maximumAge: null,
    minimumAverage: null,
    maximumAverage: null,
    handicapPercentage: null,
    handicapBase: null,
    maximumHandicapPerGame: null,
    gender: null,
    ...overrides,
  }
}

const fraction = (value: number) => ({ toNumber: () => value })

describe('toDivision', () => {
  it('maps a scratch division with no limits (DIV-12)', () => {
    const result = toDivision(createRow())

    expect(result.success && result.data).toEqual({
      id: '3f2c9d1e-5b7a-4c68-9e0d-1a2b3c4d5e6f',
      name: 'Open',
      number: 1,
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

  it('maps every limit and the handicap settings (DIV-12)', () => {
    const result = toDivision(
      createRow({
        minimumAge: 50,
        maximumAge: 99,
        minimumAverage: 150,
        maximumAverage: 189,
        handicapPercentage: fraction(0.8),
        handicapBase: 210,
        maximumHandicapPerGame: 40,
      }),
    )

    expect(result.success && result.data).toMatchObject({
      minimumAge: 50,
      maximumAge: 99,
      minimumAverage: 150,
      maximumAverage: 189,
      handicapPercentage: 80,
      handicapBase: 210,
      maximumHandicapPerGame: 40,
    })
  })

  it.each([
    [0, 'Male'],
    [1, 'Female'],
    [null, null],
  ])('maps stored gender %s to %s (DIV-12)', (stored, name) => {
    const result = toDivision(createRow({ gender: stored }))

    expect(result.success && result.data.gender).toBe(name)
  })

  it('turns a fraction into a whole percent without float noise (DIV-12)', () => {
    // 0.07 * 100 is 7.000000000000001 in floating point.
    const result = toDivision(createRow({ handicapPercentage: fraction(0.07) }))

    expect(result.success && result.data.handicapPercentage).toBe(7)
  })

  it('keeps a number or limit that DIV-01 to DIV-11 would refuse on save (D-39)', () => {
    const result = toDivision(createRow({ number: 0, minimumAge: 70, maximumAge: 20 }))

    expect(result.success).toBe(true)
  })

  it.each([
    ['an id that is not a UUID', { id: 'not-a-uuid' }],
    ['an empty name', { name: '' }],
    ['a gender other than 0 or 1', { gender: 2 }],
  ])('rejects a row with %s (D-39)', (_label, override) => {
    expect(toDivision(createRow(override)).success).toBe(false)
  })
})
