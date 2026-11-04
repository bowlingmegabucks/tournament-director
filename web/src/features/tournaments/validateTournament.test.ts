import { describe, expect, it } from 'vitest'
import { emptyTournamentForm, toNewTournament, validateTournament } from './validateTournament'
import type { TournamentFormValues } from './types'

const valid: TournamentFormValues = {
  name: 'Spring Classic',
  startDate: '2027-03-12',
  endDate: '2027-03-14',
  bowlingCenter: 'Bowl-O-Rama',
  entryFee: '60',
  games: '5',
  finalsRatio: '8',
  cashRatio: '5',
  superSweeperCashRatio: '4',
}

const errorsFor = (changes: Partial<TournamentFormValues>) =>
  validateTournament({ ...valid, ...changes })

describe('validateTournament', () => {
  it('finds nothing wrong with a complete form', () => {
    expect(validateTournament(valid)).toEqual({})
  })

  it('asks for every field on an empty form', () => {
    expect(validateTournament(emptyTournamentForm)).toEqual({
      name: 'Name is required',
      startDate: 'Start date is required',
      endDate: 'End date is required',
      bowlingCenter: 'Bowling center is required',
      entryFee: 'Entry fee is required',
      games: 'Games is required',
      finalsRatio: 'Finals ratio is required',
      cashRatio: 'Cash ratio is required',
      superSweeperCashRatio: 'Super sweeper cash ratio is required',
    })
  })

  describe.each([
    ['name', 'Name'],
    ['bowlingCenter', 'Bowling center'],
  ] as const)('%s (TRN-01, TRN-07)', (key, label) => {
    it.each(['', '   '])('refuses %j', (value) => {
      expect(errorsFor({ [key]: value })).toEqual({ [key]: `${label} is required` })
    })

    it('refuses 101 characters and accepts 100', () => {
      expect(errorsFor({ [key]: 'x'.repeat(101) })).toEqual({
        [key]: `${label} cannot be longer than 100 characters`,
      })
      expect(errorsFor({ [key]: 'x'.repeat(100) })).toEqual({})
    })

    it('counts trimmed text', () => {
      expect(errorsFor({ [key]: ` ${'x'.repeat(100)} ` })).toEqual({})
    })
  })

  describe('dates (TRN-02, D-124)', () => {
    it.each(['2027-02-30', '03/12/2027', 'soon', '2027-3-1', '2027-03-12x', 'x2027-03-12'])(
      'refuses %j',
      (startDate) => {
        expect(errorsFor({ startDate })).toEqual({ startDate: 'Enter a valid date' })
      },
    )

    it('accepts an end date equal to the start date', () => {
      expect(errorsFor({ startDate: '2027-03-12', endDate: '2027-03-12' })).toEqual({})
    })

    it('refuses an end date before the start date, on the end field', () => {
      expect(errorsFor({ startDate: '2027-03-14', endDate: '2027-03-12' })).toEqual({
        endDate: 'End date must be on or after start date',
      })
    })

    it('does not compare when a date has its own error', () => {
      expect(errorsFor({ endDate: 'soon' })).toEqual({ endDate: 'Enter a valid date' })
    })

    it('does not compare when the start date has its own error', () => {
      expect(errorsFor({ startDate: 'zzzz', endDate: '2027-03-12' })).toEqual({
        startDate: 'Enter a valid date',
      })
    })

    it('accepts dates in the past', () => {
      expect(errorsFor({ startDate: '1999-01-01', endDate: '1999-01-02' })).toEqual({})
    })
  })

  describe('entry fee (TRN-03)', () => {
    it.each([
      ['0', 'Entry fee must be greater than $0'],
      ['-5', 'Entry fee must be greater than $0'],
      ['1000', 'Entry fee cannot be more than $999.99'],
      ['10.123', 'Use at most two decimal places'],
      ['sixty', 'Enter a number'],
      ['1e2', 'Enter a number'],
      ['abc5', 'Enter a number'],
      ['5abc', 'Enter a number'],
      ['.', 'Enter a number'],
      ['5.5.5', 'Enter a number'],
      ['', 'Entry fee is required'],
    ])('refuses %j', (entryFee, message) => {
      expect(errorsFor({ entryFee })).toEqual({ entryFee: message })
    })

    it.each(['0.01', '7.55', '999.99', ' 60 ', '60.', '.5', '.55'])('accepts %j', (entryFee) => {
      expect(errorsFor({ entryFee })).toEqual({})
    })
  })

  describe('games (TRN-04)', () => {
    it.each([
      ['0', 'Must have at least one game'],
      ['100', 'Games cannot be more than 99'],
      ['2.5', 'Enter a whole number'],
      ['five', 'Enter a number'],
    ])('refuses %j', (games, message) => {
      expect(errorsFor({ games })).toEqual({ games: message })
    })

    it.each(['1', '99'])('accepts %j', (games) => {
      expect(errorsFor({ games })).toEqual({})
    })
  })

  describe.each([
    ['finalsRatio', 'Finals ratio'],
    ['cashRatio', 'Cash ratio'],
  ] as const)('%s (TRN-05, TRN-06)', (key, label) => {
    it.each([
      ['1', `${label} must be greater than 1`],
      ['0.5', `${label} must be greater than 1`],
      ['100', `${label} cannot be more than 99.9`],
      ['5.25', 'Use at most one decimal place'],
    ])('refuses %j', (value, message) => {
      expect(errorsFor({ [key]: value })).toEqual({ [key]: message })
    })

    it.each(['1.1', '7.5', '99.9', '5.50'])('accepts %j', (value) => {
      expect(errorsFor({ [key]: value })).toEqual({})
    })
  })

  describe('super sweeper cash ratio (TRN-09, D-13, D-122)', () => {
    it.each([
      ['0', 'Super sweeper cash ratio must be at least 1'],
      ['0.9', 'Super sweeper cash ratio must be at least 1'],
      ['100', 'Super sweeper cash ratio cannot be more than 99.9'],
      ['2.25', 'Use at most one decimal place'],
    ])('refuses %j', (superSweeperCashRatio, message) => {
      expect(errorsFor({ superSweeperCashRatio })).toEqual({ superSweeperCashRatio: message })
    })

    it.each(['1', '8', '99.9'])('accepts %j', (superSweeperCashRatio) => {
      expect(errorsFor({ superSweeperCashRatio })).toEqual({})
    })
  })

  it('turns a valid form into the body to send, with numbers and trimmed text', () => {
    expect(
      toNewTournament({
        ...valid,
        name: ' Spring Classic ',
        bowlingCenter: ' Bowl-O-Rama ',
        entryFee: '47.50',
        superSweeperCashRatio: '4.5',
      }),
    ).toEqual({
      name: 'Spring Classic',
      startDate: '2027-03-12',
      endDate: '2027-03-14',
      bowlingCenter: 'Bowl-O-Rama',
      entryFee: 47.5,
      games: 5,
      finalsRatio: 8,
      cashRatio: 5,
      superSweeperCashRatio: 4.5,
    })
  })
})
