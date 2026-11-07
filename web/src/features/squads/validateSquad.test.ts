import { describe, expect, it } from 'vitest'
import { createSquad } from '../../mocks/data'
import type { SquadFormValues } from './types'
import { emptySquadForm, startingValues, toNewSquad, validateSquad } from './validateSquad'

const valid: SquadFormValues = {
  date: '2026-10-24T09:00',
  startingLane: '1',
  numberOfLanes: '24',
  maxPerPair: '4',
  entryFee: '',
  finalsRatio: '',
  cashRatio: '',
}
const dates = { startDate: '2026-10-24', endDate: '2026-10-25' }
const errorsFor = (changes: Partial<SquadFormValues>, within = dates) =>
  validateSquad({ ...valid, ...changes }, within)

describe('validateSquad', () => {
  it('passes the required fields alone, with every override blank (SQD-08, D-170)', () => {
    expect(validateSquad(valid, dates)).toEqual({})
  })

  it('passes a full set of values at their limits', () => {
    expect(
      validateSquad(
        {
          ...valid,
          startingLane: '199',
          numberOfLanes: '200',
          maxPerPair: '5',
          entryFee: '999.99',
          finalsRatio: '99.9',
          cashRatio: '1.1',
        },
        dates,
      ),
    ).toEqual({})
  })

  describe('date (SQD-03)', () => {
    it.each(['', '   '])('needs one: %j', (date) => {
      expect(errorsFor({ date })).toEqual({ date: 'Date and time is required' })
    })

    it.each(['2026-10-24', '2026-10-24T09', 'noon', '2026-02-30T09:00', '2026-10-24T24:00'])(
      'refuses %j',
      (date) => {
        expect(errorsFor({ date })).toEqual({ date: 'Enter a date and time' })
      },
    )

    it('refuses the minute before the start day and after the end day', () => {
      expect(errorsFor({ date: '2026-10-23T23:59' })).toEqual({
        date: 'Squad date must be after tournament start',
      })
      expect(errorsFor({ date: '2026-10-26T00:00' })).toEqual({
        date: 'Squad date must be before tournament end',
      })
    })

    it('accepts the first and last minute of the tournament', () => {
      expect(errorsFor({ date: '2026-10-24T00:00' })).toEqual({})
      expect(errorsFor({ date: '2026-10-25T23:59' })).toEqual({})
    })

    it('leaves the range to the API when the dates are not known', () => {
      expect(validateSquad({ ...valid, date: '2030-01-01T09:00' })).toEqual({})
    })
  })

  describe('what counts as a number', () => {
    it.each([' 3 ', '03'])('reads %j as a number, spaces and all (SQD-06)', (startingLane) => {
      expect(errorsFor({ startingLane })).toEqual({})
    })

    it.each(['.5', '60.', '.55', '-0'])(
      'reads %j as a fee, a bare dot or a minus included (SQD-08)',
      (entryFee) => {
        expect(errorsFor({ entryFee })).not.toHaveProperty('entryFee', 'Enter a number')
      },
    )

    it.each(['x5', '5x', '5 5', '1e3', '--5', '.', '-'])(
      'refuses %j as not a number',
      (entryFee) => {
        expect(errorsFor({ entryFee })).toEqual({ entryFee: 'Enter a number' })
      },
    )
  })

  describe('starting lane (SQD-06, D-168)', () => {
    it.each([
      ['2', 'Starting lane must be odd'],
      ['0', 'Starting lane must be between 1 and 199'],
      ['200', 'Starting lane must be between 1 and 199'],
      ['1.5', 'Enter a whole number'],
      ['one', 'Enter a number'],
      ['', 'Starting lane is required'],
    ])('refuses %j', (startingLane, message) => {
      expect(errorsFor({ startingLane })).toEqual({ startingLane: message })
    })
  })

  describe('number of lanes (SQD-05, D-168)', () => {
    it.each([
      ['3', 'Number of lanes must be even'],
      ['0', 'Number of lanes must be between 2 and 200'],
      ['202', 'Number of lanes must be between 2 and 200'],
      ['2.5', 'Enter a whole number'],
      ['many', 'Enter a number'],
      ['', 'Number of lanes is required'],
    ])('refuses %j', (numberOfLanes, message) => {
      expect(errorsFor({ numberOfLanes })).toEqual({ numberOfLanes: message })
    })
  })

  describe('max per pair (SQD-04, D-168)', () => {
    it.each(['2', '3', '4', '5'])('accepts %s', (maxPerPair) => {
      expect(errorsFor({ maxPerPair })).toEqual({})
    })

    it.each([
      ['1', 'Max per pair must be between 2 and 5'],
      ['6', 'Max per pair must be between 2 and 5'],
      ['2.5', 'Enter a whole number'],
      ['', 'Max per pair is required'],
    ])('refuses %j', (maxPerPair, message) => {
      expect(errorsFor({ maxPerPair })).toEqual({ maxPerPair: message })
    })
  })

  describe('entry fee (SQD-08, D-170)', () => {
    it.each(['0', '0.5', '60', '999.99'])('accepts %s', (entryFee) => {
      expect(errorsFor({ entryFee })).toEqual({})
    })

    it.each([
      ['-0.01', 'Entry fee must be between $0 and $999.99'],
      ['1000', 'Entry fee must be between $0 and $999.99'],
      ['60.555', 'Use at most two decimal places'],
      ['sixty', 'Enter a number'],
    ])('refuses %j', (entryFee, message) => {
      expect(errorsFor({ entryFee })).toEqual({ entryFee: message })
    })
  })

  describe.each([
    ['finalsRatio', 'Finals ratio'],
    ['cashRatio', 'Cash ratio'],
  ] as const)('%s (SQD-02, D-170)', (field, label) => {
    it.each(['1.1', '6', '99.9'])('accepts %s', (value) => {
      expect(errorsFor({ [field]: value })).toEqual({})
    })

    it.each([
      ['1', `${label} must be greater than 1`],
      ['0', `${label} must be greater than 1`],
      ['99.95', `${label} cannot be more than 99.9`],
      ['100', `${label} cannot be more than 99.9`],
      ['6.25', 'Use at most one decimal place'],
      ['1.05', 'Use at most one decimal place'],
      ['six', 'Enter a number'],
    ])('refuses %j', (value, message) => {
      expect(errorsFor({ [field]: value })).toEqual({ [field]: message })
    })
  })

  it('names every field that fails', () => {
    expect(validateSquad(emptySquadForm, dates)).toEqual({
      date: 'Date and time is required',
      startingLane: 'Starting lane is required',
      numberOfLanes: 'Number of lanes is required',
      maxPerPair: 'Max per pair is required',
    })
  })
})

describe('toNewSquad', () => {
  it('turns the text into numbers and a blank override into null (D-170)', () => {
    expect(toNewSquad(valid)).toEqual({
      date: '2026-10-24T09:00',
      startingLane: 1,
      numberOfLanes: 24,
      maxPerPair: 4,
      entryFee: null,
      finalsRatio: null,
      cashRatio: null,
    })
  })

  it('reads a box of spaces as blank (D-170)', () => {
    expect(
      toNewSquad({ ...valid, entryFee: '   ', finalsRatio: ' ', cashRatio: '  ' }),
    ).toMatchObject({
      entryFee: null,
      finalsRatio: null,
      cashRatio: null,
    })
  })

  it('keeps a typed fee of 0 and the ratios (SQD-08)', () => {
    expect(
      toNewSquad({
        ...valid,
        date: ' 2026-10-24T09:00 ',
        entryFee: '0',
        finalsRatio: '5.5',
        cashRatio: ' 3 ',
      }),
    ).toMatchObject({ date: '2026-10-24T09:00', entryFee: 0, finalsRatio: 5.5, cashRatio: 3 })
  })
})

describe('startingValues (D-172)', () => {
  it('is blank for a tournament with no squad, or while the list is unknown', () => {
    expect(startingValues([])).toEqual(emptySquadForm)
    expect(startingValues(undefined)).toEqual(emptySquadForm)
  })

  it('copies lanes and bowlers per pair from the latest squad, and nothing else', () => {
    const squads = [
      createSquad({ startingLane: 1, numberOfLanes: 24, maxPerPair: 4 }),
      createSquad({ startingLane: 9, numberOfLanes: 8, maxPerPair: 2 }),
      createSquad({
        startingLane: 5,
        numberOfLanes: 12,
        maxPerPair: 3,
        entryFee: 60,
        entryFeeOverridden: true,
      }),
    ]

    expect(startingValues(squads)).toEqual({
      ...emptySquadForm,
      startingLane: '5',
      numberOfLanes: '12',
      maxPerPair: '3',
    })
  })
})
