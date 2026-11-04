import { describe, expect, it } from 'vitest'
import { parseUpdateTournament } from './updateRequest.ts'

function errorsFor(body: unknown) {
  const result = parseUpdateTournament(body)
  return result.success ? undefined : result.errors
}

describe('parseUpdateTournament (TRN-24, D-127)', () => {
  it('accepts an empty body, which changes nothing', () => {
    expect(parseUpdateTournament({})).toEqual({ success: true, data: {} })
  })

  it('keeps only the fields that were sent, and trims the text (TRN-01, TRN-07)', () => {
    const result = parseUpdateTournament({ name: '  Spring Classic ', bowlingCenter: ' Lanes  ' })

    expect(result).toEqual({
      success: true,
      data: { name: 'Spring Classic', bowlingCenter: 'Lanes' },
    })
  })

  it('accepts every field at once', () => {
    const body = {
      name: 'Spring Classic',
      startDate: '2027-03-12',
      endDate: '2027-03-14',
      entryFee: 60,
      games: 5,
      finalsRatio: 8,
      cashRatio: 5,
      superSweeperCashRatio: 4,
      bowlingCenter: 'Bowl-O-Rama',
      confirmWarnings: true,
    }

    expect(parseUpdateTournament(body)).toEqual({ success: true, data: body })
  })

  it.each([
    ['name', '', 'Name is required'],
    ['name', null, 'Name is required'],
    ['name', 'x'.repeat(101), 'Name cannot be longer than 100 characters'],
    ['bowlingCenter', '  ', 'Bowling center is required'],
    ['startDate', '', 'Start date is required'],
    ['endDate', '12/03/2027', 'Enter a valid date'],
    ['entryFee', 0, 'Entry fee must be greater than $0'],
    ['entryFee', 1000, 'Entry fee cannot be more than $999.99'],
    ['entryFee', 7.555, 'Use at most two decimal places'],
    ['games', 0, 'Must have at least one game'],
    ['games', 100, 'Games cannot be more than 99'],
    ['games', 2.5, 'Enter a whole number'],
    ['finalsRatio', 1, 'Finals ratio must be greater than 1'],
    ['finalsRatio', 100, 'Finals ratio cannot be more than 99.9'],
    ['cashRatio', 1, 'Cash ratio must be greater than 1'],
    ['cashRatio', 5.55, 'Use at most one decimal place'],
    ['superSweeperCashRatio', 0, 'Super sweeper cash ratio must be at least 1'],
    ['superSweeperCashRatio', '4', 'Enter a number'],
  ])('refuses %s of %j with the create wording (D-125, D-13)', (field, value, message) => {
    expect(errorsFor({ [field]: value })).toEqual({ [field]: message })
  })

  it('accepts the lowest super sweeper ratio of 1 (D-13)', () => {
    expect(errorsFor({ superSweeperCashRatio: 1 })).toBeUndefined()
  })

  it('does not check a field that was not sent, so a stored 0 is left alone (D-17)', () => {
    expect(errorsFor({ name: 'Renamed' })).toBeUndefined()
  })

  it('refuses completed, as create does (D-119, D-130)', () => {
    expect(errorsFor({ completed: true })).toEqual({ completed: 'This field is not accepted' })
  })

  it.each(['yes', 1, null])('refuses confirmWarnings of %j', (value) => {
    expect(errorsFor({ confirmWarnings: value })).toEqual({
      confirmWarnings: 'Send confirmWarnings as true or false',
    })
  })

  it('accepts confirmWarnings false', () => {
    expect(parseUpdateTournament({ confirmWarnings: false })).toEqual({
      success: true,
      data: { confirmWarnings: false },
    })
  })

  it.each([null, 'text', 5, [1]])('says to send a JSON object for a body of %j', (body) => {
    const result = parseUpdateTournament(body)

    expect(result).toMatchObject({
      success: false,
      message: 'Send the tournament as a JSON object.',
    })
  })

  it('puts the first problem in the summary and one message per field', () => {
    const result = parseUpdateTournament({ name: '', games: 0 })

    expect(result).toEqual({
      success: false,
      message: 'Check the highlighted fields. Name is required',
      errors: { name: 'Name is required', games: 'Must have at least one game' },
    })
  })
})
