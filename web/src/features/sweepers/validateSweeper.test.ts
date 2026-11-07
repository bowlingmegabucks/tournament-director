import { describe, expect, it } from 'vitest'
import { createSweeper } from '../../mocks/data'
import type { SweeperFormValues } from './types'
import { emptySweeperForm, startingValues, toNewSweeper, validateSweeper } from './validateSweeper'

const valid: SweeperFormValues = {
  date: '2026-10-24T18:00',
  startingLane: '1',
  numberOfLanes: '24',
  maxPerPair: '4',
  entryFee: '20',
  games: '3',
  cashRatio: '5',
  bonusPins: {},
}
const dates = { startDate: '2026-10-24', endDate: '2026-10-25' }
const divisions = ['d1', 'd2']
const errorsFor = (changes: Partial<SweeperFormValues>, within = dates, ids = divisions) =>
  validateSweeper({ ...valid, ...changes }, within, ids)

describe('validateSweeper', () => {
  it('passes the required fields with every pins box blank (SQD-13, D-176)', () => {
    expect(validateSweeper(valid, dates, divisions)).toEqual({})
  })

  it('refuses lanes that run past lane 200, on the number of lanes (D-179)', () => {
    expect(errorsFor({ startingLane: '199', numberOfLanes: '4' })).toEqual({
      numberOfLanes: 'Lanes must end at lane 200 or lower',
    })
  })

  it('passes values at their limits', () => {
    expect(
      errorsFor({
        startingLane: '1',
        numberOfLanes: '200',
        maxPerPair: '5',
        entryFee: '999.99',
        games: '99',
        cashRatio: '99.9',
        bonusPins: { d1: '0', d2: '99' },
      }),
    ).toEqual({})
  })

  it('passes the smallest values', () => {
    expect(
      errorsFor({
        startingLane: '1',
        numberOfLanes: '2',
        maxPerPair: '2',
        entryFee: '0.01',
        games: '1',
        cashRatio: '1.1',
      }),
    ).toEqual({})
  })

  describe('date, lanes, and bowlers per pair (SQD-10)', () => {
    it('says "Sweeper" in the date messages', () => {
      expect(errorsFor({ date: '2026-10-23T23:59' })).toEqual({
        date: 'Sweeper date must be after tournament start',
      })
      expect(errorsFor({ date: '2026-10-26T00:00' })).toEqual({
        date: 'Sweeper date must be before tournament end',
      })
    })

    it('is required, and must be a real time', () => {
      expect(errorsFor({ date: '' })).toEqual({ date: 'Date and time is required' })
      expect(errorsFor({ date: '2026-02-30T10:00' })).toEqual({ date: 'Enter a date and time' })
    })

    it('shares the squad lane rules', () => {
      expect(errorsFor({ startingLane: '2', numberOfLanes: '3', maxPerPair: '6' })).toEqual({
        startingLane: 'Starting lane must be odd',
        numberOfLanes: 'Number of lanes must be even',
        maxPerPair: 'Max per pair must be between 2 and 5',
      })
    })
  })

  describe('entry fee (SQD-12, D-175)', () => {
    it.each([
      ['', 'Entry fee is required'],
      ['abc', 'Enter a number'],
      ['0', 'Entry fee must be greater than $0'],
      ['-1', 'Entry fee must be greater than $0'],
      ['1000', 'Entry fee cannot be more than $999.99'],
      ['20.123', 'Use at most two decimal places'],
    ])('says %j: %s', (entryFee, message) => {
      expect(errorsFor({ entryFee })).toEqual({ entryFee: message })
    })
  })

  describe('games (SQD-12, D-175)', () => {
    it.each([
      ['', 'Games is required'],
      ['abc', 'Enter a number'],
      ['2.5', 'Enter a whole number'],
      ['0', 'Games must be between 1 and 99'],
      ['100', 'Games must be between 1 and 99'],
    ])('says %j: %s', (games, message) => {
      expect(errorsFor({ games })).toEqual({ games: message })
    })
  })

  describe('cash ratio (SQD-11, D-175)', () => {
    it.each([
      ['', 'Cash ratio is required'],
      ['abc', 'Enter a number'],
      ['1', 'Cash ratio must be greater than 1'],
      ['100', 'Cash ratio cannot be more than 99.9'],
      ['4.55', 'Use at most one decimal place'],
    ])('says %j: %s', (cashRatio, message) => {
      expect(errorsFor({ cashRatio })).toEqual({ cashRatio: message })
    })
  })

  describe('bonus pins (SQD-13, D-176)', () => {
    it.each([
      ['abc', 'Enter a number'],
      ['1.5', 'Enter a whole number'],
      ['-1', 'Bonus pins must be between 0 and 99'],
      ['100', 'Bonus pins must be between 0 and 99'],
    ])('says %j for a division: %s', (text, message) => {
      expect(errorsFor({ bonusPins: { d1: text, d2: '6' } })).toEqual({
        'bonusPins.d1': message,
      })
    })

    it('checks only the divisions shown', () => {
      expect(errorsFor({ bonusPins: { gone: 'abc' } })).toEqual({})
    })

    it('treats a blank box and spaces as none', () => {
      expect(errorsFor({ bonusPins: { d1: '', d2: '  ' } })).toEqual({})
    })
  })
})

describe('toNewSweeper', () => {
  it('turns the boxes into numbers, one pins entry per division shown, blank as null', () => {
    expect(
      toNewSweeper(
        {
          ...valid,
          date: ' 2026-10-24T18:00 ',
          entryFee: '20.50',
          bonusPins: { d1: '10', d2: ' ', gone: '5' },
        },
        divisions,
      ),
    ).toEqual({
      date: '2026-10-24T18:00',
      startingLane: 1,
      numberOfLanes: 24,
      maxPerPair: 4,
      entryFee: 20.5,
      games: 3,
      cashRatio: 5,
      bonusPins: { d1: 10, d2: null },
    })
  })

  it('sends null for a division whose box was never typed in', () => {
    expect(toNewSweeper(valid, ['d1']).bonusPins).toEqual({ d1: null })
  })

  it('sends a typed 0 as 0', () => {
    expect(toNewSweeper({ ...valid, bonusPins: { d1: '0' } }, ['d1']).bonusPins).toEqual({ d1: 0 })
  })
})

describe('startingValues (D-178)', () => {
  it('is blank when there is no sweeper', () => {
    expect(startingValues([])).toEqual(emptySweeperForm)
    expect(startingValues(undefined)).toEqual(emptySweeperForm)
  })

  it('takes the lanes and bowlers per pair of the latest sweeper, the last in the list', () => {
    const early = createSweeper({ startingLane: 1, numberOfLanes: 12, maxPerPair: 4 })
    const late = createSweeper({
      startingLane: 11,
      numberOfLanes: 10,
      maxPerPair: 5,
      entryFee: 30,
      games: 4,
      cashRatio: 6,
    })

    const middle = createSweeper({ startingLane: 3, numberOfLanes: 8, maxPerPair: 2 })

    expect(startingValues([early, middle, late])).toEqual({
      ...emptySweeperForm,
      startingLane: '11',
      numberOfLanes: '10',
      maxPerPair: '5',
    })
  })
})
