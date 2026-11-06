import { describe, expect, it } from 'vitest'
import { parseUpdateDivision } from './updateRequest.ts'

function errorsOf(body: unknown): Record<string, string> {
  const result = parseUpdateDivision(body)
  if (result.success) throw new Error('expected the body to fail')
  return result.errors
}

function changesOf(body: unknown) {
  const result = parseUpdateDivision(body)
  if (!result.success) throw new Error('expected the body to pass')
  return result.changes
}

describe('parseUpdateDivision', () => {
  it('keeps only the fields sent (DIV-12)', () => {
    expect(changesOf({ name: 'Open' })).toEqual({ name: 'Open' })
  })

  it('accepts an empty body: nothing changes (DIV-12)', () => {
    expect(parseUpdateDivision({})).toEqual({ success: true, changes: {}, confirmWarnings: false })
  })

  it('reads confirmWarnings and leaves it out of the changes (D-129)', () => {
    expect(parseUpdateDivision({ name: 'Open', confirmWarnings: true })).toEqual({
      success: true,
      changes: { name: 'Open' },
      confirmWarnings: true,
    })
  })

  it('refuses a confirmWarnings that is not a boolean (D-129)', () => {
    expect(errorsOf({ confirmWarnings: 'yes' }).confirmWarnings).toBe(
      'Send confirmWarnings as true or false',
    )
  })

  it('trims the name (DIV-02)', () => {
    expect(changesOf({ name: '  Open  ' })).toEqual({ name: 'Open' })
  })

  it.each([
    ['', 'Name is required'],
    ['   ', 'Name is required'],
    [null, 'Name is required'],
    ['x'.repeat(101), 'Name cannot be longer than 100 characters'],
  ])('refuses the name %j (DIV-02)', (name, message) => {
    expect(errorsOf({ name }).name).toBe(message)
  })

  it.each(['', null])('clears a limit sent as %j (D-147)', (blank) => {
    expect(changesOf({ minimumAge: blank, gender: blank, handicapPercentage: blank })).toEqual({
      minimumAge: null,
      gender: null,
      handicapPercentage: null,
    })
  })

  it('refuses a number, and any key it does not know (D-146)', () => {
    expect(parseUpdateDivision({ number: 4 }).success).toBe(false)
    expect(parseUpdateDivision({ tournamentId: 'x' }).success).toBe(false)
  })

  it.each([
    [{ minimumAge: 0 }, 'minimumAge', 'Minimum age must be between 1 and 120'],
    [{ maximumAge: 121 }, 'maximumAge', 'Maximum age must be between 1 and 120'],
    [{ minimumAverage: 301 }, 'minimumAverage', 'Minimum average must be between 1 and 300'],
    [{ maximumAverage: 0 }, 'maximumAverage', 'Maximum average must be between 1 and 300'],
    [
      { handicapPercentage: 0 },
      'handicapPercentage',
      'Handicap percentage must be at least 1, or leave it blank',
    ],
    [
      { handicapPercentage: 1000 },
      'handicapPercentage',
      'Handicap percentage cannot be more than 999',
    ],
    [{ handicapBase: 301 }, 'handicapBase', 'Handicap base must be between 0 and 300'],
    [
      { maximumHandicapPerGame: 0 },
      'maximumHandicapPerGame',
      'Maximum handicap per game must be between 1 and 300',
    ],
    [{ gender: 'Other' }, 'gender', 'Gender must be Male or Female, or blank'],
    [{ minimumAge: 1.5 }, 'minimumAge', 'Enter a whole number'],
  ])('checks a field sent with the add rule: %j (DIV-04 to DIV-11)', (body, field, message) => {
    expect(errorsOf(body)[field]).toBe(message)
  })

  it('does not run the rules that compare two fields: the plan does, on the stored values (DIV-05)', () => {
    expect(parseUpdateDivision({ minimumAge: 60, maximumAge: 55 }).success).toBe(true)
    expect(parseUpdateDivision({ handicapPercentage: 90 }).success).toBe(true)
  })

  it('refuses a body that is not an object, naming the division (DIV-12)', () => {
    for (const body of ['x', null]) {
      const result = parseUpdateDivision(body)
      expect(result).toMatchObject({
        success: false,
        message: 'Send the division as a JSON object.',
      })
    }
  })
})
