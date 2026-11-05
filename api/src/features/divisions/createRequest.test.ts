import { describe, expect, it } from 'vitest'
import { parseCreateDivision } from './createRequest.ts'

const valid = { name: 'Open' }

function errorsOf(body: unknown): Record<string, string> {
  const result = parseCreateDivision(body)
  if (result.success) throw new Error('expected the body to fail')
  return result.errors
}

describe('parseCreateDivision', () => {
  it('accepts a name alone and stores every limit as not set (DIV-12)', () => {
    expect(parseCreateDivision(valid)).toEqual({
      success: true,
      confirmWarnings: false,
      data: {
        name: 'Open',
        gender: null,
        minimumAge: null,
        maximumAge: null,
        minimumAverage: null,
        maximumAverage: null,
        handicapPercentage: null,
        handicapBase: null,
        maximumHandicapPerGame: null,
      },
    })
  })

  it('keeps a full set of limits as sent (DIV-04 to DIV-11)', () => {
    const body = {
      name: 'Seniors 50+',
      gender: 'Female',
      minimumAge: 50,
      maximumAge: 120,
      minimumAverage: 1,
      maximumAverage: 300,
      handicapPercentage: 90,
      handicapBase: 220,
      maximumHandicapPerGame: 40,
      confirmWarnings: true,
    }
    const result = parseCreateDivision(body)
    expect(result).toEqual({
      success: true,
      confirmWarnings: true,
      data: { ...body, confirmWarnings: undefined },
    })
    expect(result.success && 'confirmWarnings' in result.data).toBe(false)
  })

  it('treats "", null, and a missing key alike as not set', () => {
    const result = parseCreateDivision({
      name: 'Open',
      minimumAge: '',
      maximumAge: null,
      gender: '',
    })
    expect(result).toMatchObject({
      success: true,
      data: { minimumAge: null, maximumAge: null, gender: null },
    })
  })

  it('drops a number the client sends, since the server picks it (D-139)', () => {
    const result = parseCreateDivision({ ...valid, number: 7 })
    expect(result.success && 'number' in result.data).toBe(false)
    expect(result.success).toBe(true)
  })

  it('trims the name (DIV-02, D-141)', () => {
    expect(parseCreateDivision({ name: '  Open  ' })).toMatchObject({ data: { name: 'Open' } })
  })

  it.each([
    ['a missing name', {}, 'Name is required'],
    ['an empty name', { name: '' }, 'Name is required'],
    ['a name of spaces', { name: '   ' }, 'Name is required'],
    ['a name that is null', { name: null }, 'Name is required'],
    ['a name that is not text', { name: 5 }, 'Enter text'],
    [
      'a name over 100 characters',
      { name: 'x'.repeat(101) },
      'Name cannot be longer than 100 characters',
    ],
  ])('refuses %s (DIV-02)', (_label, body, message) => {
    expect(errorsOf(body)['name']).toBe(message)
  })

  it('accepts a name of exactly 100 characters (D-141)', () => {
    expect(parseCreateDivision({ name: 'x'.repeat(100) }).success).toBe(true)
  })

  it.each([
    ['minimumAge', 0, 'Minimum age must be between 1 and 120'],
    ['minimumAge', 121, 'Minimum age must be between 1 and 120'],
    ['maximumAge', 0, 'Maximum age must be between 1 and 120'],
    ['maximumAge', 121, 'Maximum age must be between 1 and 120'],
    ['minimumAverage', 0, 'Minimum average must be between 1 and 300'],
    ['minimumAverage', 301, 'Minimum average must be between 1 and 300'],
    ['maximumAverage', 0, 'Maximum average must be between 1 and 300'],
    ['maximumAverage', 301, 'Maximum average must be between 1 and 300'],
    ['handicapBase', -1, 'Handicap base must be between 0 and 300'],
    ['handicapBase', 301, 'Handicap base must be between 0 and 300'],
    ['maximumHandicapPerGame', 0, 'Maximum handicap per game must be between 1 and 300'],
    ['maximumHandicapPerGame', 301, 'Maximum handicap per game must be between 1 and 300'],
  ])('refuses %s of %s (DIV-04, DIV-06, DIV-10, DIV-11, D-141)', (field, value, message) => {
    // A base and percent alongside, so the cap's own range is the only failure.
    const body = { ...valid, handicapPercentage: 90, handicapBase: 220, [field]: value }
    expect(errorsOf(body)[field]).toBe(message)
  })

  it.each([
    ['minimumAge', 1],
    ['maximumAge', 120],
    ['minimumAverage', 1],
    ['maximumAverage', 300],
    ['handicapBase', 0],
    ['handicapBase', 300],
    ['maximumHandicapPerGame', 1],
    ['maximumHandicapPerGame', 300],
  ])('accepts %s of %s at its edge (D-141)', (field, value) => {
    const body = { ...valid, handicapPercentage: 90, handicapBase: 220, [field]: value }
    expect(parseCreateDivision(body).success).toBe(true)
  })

  it.each([1.5, '12', true])('refuses an age of %s that is not a whole number (D-125)', (value) => {
    const message = errorsOf({ ...valid, minimumAge: value })['minimumAge']
    expect(message).toMatch(/^Enter a (whole )?number$/)
  })

  it('says "Enter a whole number" for a fraction (D-125)', () => {
    expect(errorsOf({ ...valid, minimumAge: 1.5 })['minimumAge']).toBe('Enter a whole number')
  })

  it('refuses a minimum age above the maximum and names the minimum (DIV-05)', () => {
    expect(errorsOf({ ...valid, minimumAge: 60, maximumAge: 40 })['minimumAge']).toBe(
      'Minimum age must be less than or equal to maximum age',
    )
  })

  it('accepts equal ages and equal averages (DIV-05, DIV-07)', () => {
    expect(
      parseCreateDivision({
        ...valid,
        minimumAge: 50,
        maximumAge: 50,
        minimumAverage: 180,
        maximumAverage: 180,
      }).success,
    ).toBe(true)
  })

  it('refuses a minimum average above the maximum and names the minimum (DIV-07)', () => {
    expect(errorsOf({ ...valid, minimumAverage: 200, maximumAverage: 150 })['minimumAverage']).toBe(
      'Minimum average must be less than or equal to maximum average',
    )
  })

  it.each([
    [0, 'Handicap percentage must be at least 1, or leave it blank'],
    [-5, 'Handicap percentage must be at least 1, or leave it blank'],
    [1000, 'Handicap percentage cannot be more than 999'],
    [90.5, 'Enter a whole number'],
  ])('refuses a handicap percentage of %s (DIV-08, D-141)', (value, message) => {
    expect(
      errorsOf({ ...valid, handicapPercentage: value, handicapBase: 220 })['handicapPercentage'],
    ).toBe(message)
  })

  it.each([1, 100, 101, 999])('accepts a handicap percentage of %s (DIV-08, D-141)', (value) => {
    expect(
      parseCreateDivision({ ...valid, handicapPercentage: value, handicapBase: 220 }).success,
    ).toBe(true)
  })

  it('refuses a percentage with no base, on the base (DIV-09)', () => {
    expect(errorsOf({ ...valid, handicapPercentage: 90 })['handicapBase']).toBe(
      'Handicap base is required with a handicap percentage',
    )
  })

  it('refuses a base with no percentage, on the percentage (DIV-09)', () => {
    expect(errorsOf({ ...valid, handicapBase: 220 })['handicapPercentage']).toBe(
      'Handicap percentage is required with a handicap base',
    )
  })

  it('accepts a base of 0 with a percentage (DIV-09, DIV-10)', () => {
    expect(parseCreateDivision({ ...valid, handicapPercentage: 90, handicapBase: 0 }).success).toBe(
      true,
    )
  })

  it('refuses a cap with no base and percentage (DIV-11)', () => {
    expect(errorsOf({ ...valid, maximumHandicapPerGame: 40 })['maximumHandicapPerGame']).toBe(
      'Maximum handicap per game is allowed only with a handicap percentage and base',
    )
    expect(
      errorsOf({ ...valid, handicapPercentage: 90, maximumHandicapPerGame: 40 })[
        'maximumHandicapPerGame'
      ],
    ).toBe('Maximum handicap per game is allowed only with a handicap percentage and base')
  })

  it.each(['Male', 'Female', null, ''])('accepts a gender of %j (DIV-12)', (gender) => {
    expect(parseCreateDivision({ ...valid, gender }).success).toBe(true)
  })

  it('refuses another gender (D-141)', () => {
    expect(errorsOf({ ...valid, gender: 'Other' })['gender']).toBe(
      'Gender must be Male or Female, or blank',
    )
  })

  it('gives one message per field, the first problem winning (D-121)', () => {
    const errors = errorsOf({ name: '', minimumAge: 0, maximumAge: 0 })
    expect(Object.keys(errors).sort()).toEqual(['maximumAge', 'minimumAge', 'name'])
  })

  it('refuses a key it does not know (D-119)', () => {
    expect(errorsOf({ ...valid, completed: true })['completed']).toBe('This field is not accepted')
  })

  it('refuses a confirmWarnings that is not true or false', () => {
    expect(errorsOf({ ...valid, confirmWarnings: 'yes' })['confirmWarnings']).toBe(
      'Send true or false',
    )
  })

  it.each([null, 'text', 5, []])('refuses a body that is not an object: %j', (body) => {
    const result = parseCreateDivision(body)
    expect(result).toEqual({
      success: false,
      message: 'Send the division as a JSON object.',
      errors: {},
    })
  })

  it('opens its summary with the first problem', () => {
    const result = parseCreateDivision({ name: '' })
    expect(result.success ? '' : result.message).toBe(
      'Check the highlighted fields. Name is required',
    )
  })
})
