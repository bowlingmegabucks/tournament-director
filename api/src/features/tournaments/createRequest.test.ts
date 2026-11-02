import { describe, expect, it } from 'vitest'
import { parseCreateTournament } from './createRequest.ts'

const valid = {
  name: 'Spring Classic',
  startDate: '2027-03-12',
  endDate: '2027-03-14',
  entryFee: 60,
  games: 5,
  finalsRatio: 8,
  cashRatio: 5,
  superSweeperCashRatio: 4,
  bowlingCenter: 'Bowl-O-Rama',
}

function errorsFor(changes: Record<string, unknown>) {
  const result = parseCreateTournament({ ...valid, ...changes })
  return result.success ? undefined : result.errors
}

describe('parseCreateTournament', () => {
  it('accepts a complete body and trims the text (TRN-01, TRN-07)', () => {
    const result = parseCreateTournament({
      ...valid,
      name: '  Spring Classic ',
      bowlingCenter: ' Bowl-O-Rama  ',
    })

    expect(result).toEqual({ success: true, data: valid })
  })

  describe('name (TRN-01)', () => {
    it.each([
      ['empty', '', 'Name is required'],
      ['only spaces', '   ', 'Name is required'],
      ['missing', undefined, 'Name is required'],
      ['null', null, 'Name is required'],
      ['101 characters', 'x'.repeat(101), 'Name cannot be longer than 100 characters'],
      ['a number', 5, 'Enter text'],
    ])('refuses a name that is %s', (_label, name, message) => {
      expect(errorsFor({ name })).toEqual({ name: message })
    })

    it('accepts exactly 100 characters', () => {
      expect(errorsFor({ name: 'x'.repeat(100) })).toBeUndefined()
    })
  })

  describe('bowling center (TRN-07)', () => {
    it.each([
      ['empty', '', 'Bowling center is required'],
      ['only spaces', '  ', 'Bowling center is required'],
      ['missing', undefined, 'Bowling center is required'],
      ['101 characters', 'x'.repeat(101), 'Bowling center cannot be longer than 100 characters'],
    ])('refuses a center that is %s', (_label, bowlingCenter, message) => {
      expect(errorsFor({ bowlingCenter })).toEqual({ bowlingCenter: message })
    })
  })

  describe('dates (TRN-02, D-124)', () => {
    it('requires both dates', () => {
      expect(errorsFor({ startDate: undefined, endDate: '' })).toEqual({
        startDate: 'Start date is required',
        endDate: 'End date is required',
      })
    })

    it.each(['2027-02-30', '03/12/2027', 'soon', 5])('refuses %j as a date', (startDate) => {
      expect(errorsFor({ startDate })).toEqual({ startDate: 'Enter a valid date' })
    })

    it('accepts an end date equal to the start date', () => {
      expect(errorsFor({ startDate: '2027-03-12', endDate: '2027-03-12' })).toBeUndefined()
    })

    it('refuses an end date before the start date, on the end field', () => {
      expect(errorsFor({ startDate: '2027-03-14', endDate: '2027-03-12' })).toEqual({
        endDate: 'End date must be on or after start date',
      })
    })

    it('accepts dates in the past', () => {
      expect(errorsFor({ startDate: '1999-01-01', endDate: '1999-01-02' })).toBeUndefined()
    })

    it('does not compare an end date that does not read', () => {
      expect(errorsFor({ endDate: 'soon' })).toEqual({ endDate: 'Enter a valid date' })
    })
  })

  describe('entry fee (TRN-03)', () => {
    it.each([
      [0, 'Entry fee must be greater than $0'],
      [-5, 'Entry fee must be greater than $0'],
      [1000, 'Entry fee cannot be more than $999.99'],
      [10.123, 'Use at most two decimal places'],
      ['60', 'Enter a number'],
      [undefined, 'Entry fee is required'],
      [null, 'Entry fee is required'],
    ])('refuses %j', (entryFee, message) => {
      expect(errorsFor({ entryFee })).toEqual({ entryFee: message })
    })

    it.each([0.01, 7.55, 999.99])('accepts %j', (entryFee) => {
      expect(errorsFor({ entryFee })).toBeUndefined()
    })
  })

  describe('games (TRN-04)', () => {
    it.each([
      [0, 'Must have at least one game'],
      [100, 'Games cannot be more than 99'],
      [2.5, 'Enter a whole number'],
      [undefined, 'Games is required'],
    ])('refuses %j', (games, message) => {
      expect(errorsFor({ games })).toEqual({ games: message })
    })

    it.each([1, 99])('accepts %j', (games) => {
      expect(errorsFor({ games })).toBeUndefined()
    })
  })

  describe.each([
    ['finalsRatio', 'Finals ratio'],
    ['cashRatio', 'Cash ratio'],
  ])('%s (TRN-05, TRN-06)', (key, label) => {
    it.each([
      [1, `${label} must be greater than 1`],
      [0.5, `${label} must be greater than 1`],
      [100, `${label} cannot be more than 99.9`],
      [5.25, 'Use at most one decimal place'],
      [undefined, `${label} is required`],
    ])('refuses %j', (value, message) => {
      expect(errorsFor({ [key]: value })).toEqual({ [key]: message })
    })

    it.each([1.1, 7.5, 99.9])('accepts %j', (value) => {
      expect(errorsFor({ [key]: value })).toBeUndefined()
    })
  })

  describe('super sweeper cash ratio (TRN-09, D-13, D-122)', () => {
    it.each([
      [0, 'Super sweeper cash ratio must be at least 1'],
      [0.9, 'Super sweeper cash ratio must be at least 1'],
      [100, 'Super sweeper cash ratio cannot be more than 99.9'],
      [2.25, 'Use at most one decimal place'],
      [undefined, 'Super sweeper cash ratio is required'],
    ])('refuses %j', (superSweeperCashRatio, message) => {
      expect(errorsFor({ superSweeperCashRatio })).toEqual({ superSweeperCashRatio: message })
    })

    it.each([1, 8, 99.9])('accepts %j', (superSweeperCashRatio) => {
      expect(errorsFor({ superSweeperCashRatio })).toBeUndefined()
    })
  })

  it('refuses a key it does not know, such as completed (TRN-08, D-119)', () => {
    expect(errorsFor({ completed: true })).toEqual({ completed: 'This field is not accepted' })
  })

  it('reports every field that fails, one message each (D-121)', () => {
    const result = parseCreateTournament({})

    expect(result).toMatchObject({ success: false })
    if (result.success) return
    expect(Object.keys(result.errors).sort()).toEqual(
      [
        'bowlingCenter',
        'cashRatio',
        'endDate',
        'entryFee',
        'finalsRatio',
        'games',
        'name',
        'startDate',
        'superSweeperCashRatio',
      ].sort(),
    )
  })

  it('puts the first message in the summary', () => {
    const result = parseCreateTournament({ ...valid, name: '' })

    expect(result).toEqual({
      success: false,
      message: 'Check the highlighted fields. Name is required',
      errors: { name: 'Name is required' },
    })
  })

  it.each([null, 'text', 5, [valid]])('refuses %j as a whole body', (body) => {
    expect(parseCreateTournament(body)).toEqual({
      success: false,
      message: 'Send the tournament as a JSON object.',
      errors: {},
    })
  })
})
