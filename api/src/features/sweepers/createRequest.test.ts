import { describe, expect, it } from 'vitest'
import { parseCreateSweeper } from './createRequest.ts'

const open = '11111111-1111-4111-8111-111111111111'
const women = '22222222-2222-4222-8222-222222222222'

const valid = {
  date: '2026-10-24T18:00',
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
}

function errorsOf(body: unknown): Record<string, string> {
  const result = parseCreateSweeper(body)
  if (result.success) throw new Error('expected the body to fail')
  return result.errors
}

describe('parseCreateSweeper', () => {
  it('accepts the required fields and reads missing bonus pins as none (SQD-10 to SQD-13)', () => {
    expect(parseCreateSweeper(valid)).toEqual({
      success: true,
      data: { ...valid, date: '2026-10-24T18:00:00', bonusPins: {} },
    })
  })

  it('refuses lanes that run past lane 200, on the number of lanes (D-179)', () => {
    expect(errorsOf({ ...valid, startingLane: 199, numberOfLanes: 4 })).toEqual({
      numberOfLanes: 'Lanes must end at lane 200 or lower',
    })
    expect(parseCreateSweeper({ ...valid, startingLane: 199, numberOfLanes: 2 }).success).toBe(true)
  })

  it('reads a fee typed as spaces as missing, as the form does (SQD-11)', () => {
    expect(errorsOf({ ...valid, entryFee: '   ' })).toEqual({ entryFee: 'Entry fee is required' })
  })

  it.each([undefined, null])('reads bonusPins %j as none (SQD-13)', (bonusPins) => {
    expect(parseCreateSweeper({ ...valid, bonusPins })).toMatchObject({
      success: true,
      data: { bonusPins: {} },
    })
  })

  it('shares the squad rules for date, lanes, and bowlers per pair (SQD-10)', () => {
    expect(
      errorsOf({ ...valid, date: '', startingLane: 2, numberOfLanes: 3, maxPerPair: 6 }),
    ).toEqual({
      date: 'Date and time is required',
      startingLane: 'Starting lane must be odd',
      numberOfLanes: 'Number of lanes must be even',
      maxPerPair: 'Max per pair must be between 2 and 5',
    })
  })

  describe('entry fee (SQD-12, D-175)', () => {
    it.each([0.01, 20, 999.99])('accepts %s', (entryFee) => {
      expect(parseCreateSweeper({ ...valid, entryFee })).toMatchObject({
        success: true,
        data: { entryFee },
      })
    })

    it.each([undefined, null, ''])('is required: %j', (entryFee) => {
      expect(errorsOf({ ...valid, entryFee })).toEqual({ entryFee: 'Entry fee is required' })
    })

    it.each([0, -5])('must be above $0: %s', (entryFee) => {
      expect(errorsOf({ ...valid, entryFee })).toEqual({
        entryFee: 'Entry fee must be greater than $0',
      })
    })

    it('cannot pass $999.99', () => {
      expect(errorsOf({ ...valid, entryFee: 1000 })).toEqual({
        entryFee: 'Entry fee cannot be more than $999.99',
      })
    })

    it('is refused with a third decimal, never rounded', () => {
      expect(errorsOf({ ...valid, entryFee: 20.123 })).toEqual({
        entryFee: 'Use at most two decimal places',
      })
    })

    it('must be a number', () => {
      expect(errorsOf({ ...valid, entryFee: '20' })).toEqual({ entryFee: 'Enter a number' })
    })
  })

  describe('games (SQD-12, D-175)', () => {
    it.each([1, 3, 99])('accepts %s', (games) => {
      expect(parseCreateSweeper({ ...valid, games })).toMatchObject({
        success: true,
        data: { games },
      })
    })

    it.each([undefined, null, ''])('is required: %j', (games) => {
      expect(errorsOf({ ...valid, games })).toEqual({ games: 'Games is required' })
    })

    it.each([0, -1, 100])('stays from 1 to 99: %s', (games) => {
      expect(errorsOf({ ...valid, games })).toEqual({ games: 'Games must be between 1 and 99' })
    })

    it('must be whole', () => {
      expect(errorsOf({ ...valid, games: 2.5 })).toEqual({ games: 'Enter a whole number' })
    })

    it('must be a number', () => {
      expect(errorsOf({ ...valid, games: 'three' })).toEqual({ games: 'Enter a number' })
    })
  })

  describe('cash ratio (SQD-11, D-175)', () => {
    it.each([1.1, 5, 99.9])('accepts %s', (cashRatio) => {
      expect(parseCreateSweeper({ ...valid, cashRatio })).toMatchObject({
        success: true,
        data: { cashRatio },
      })
    })

    it.each([undefined, null, ''])('is required: %j', (cashRatio) => {
      expect(errorsOf({ ...valid, cashRatio })).toEqual({ cashRatio: 'Cash ratio is required' })
    })

    it.each([1, 0, -2])('must be above 1: %s', (cashRatio) => {
      expect(errorsOf({ ...valid, cashRatio })).toEqual({
        cashRatio: 'Cash ratio must be greater than 1',
      })
    })

    it('cannot pass 99.9', () => {
      expect(errorsOf({ ...valid, cashRatio: 100 })).toEqual({
        cashRatio: 'Cash ratio cannot be more than 99.9',
      })
    })

    it('is refused with a second decimal', () => {
      expect(errorsOf({ ...valid, cashRatio: 4.55 })).toEqual({
        cashRatio: 'Use at most one decimal place',
      })
    })

    it('must be a number', () => {
      expect(errorsOf({ ...valid, cashRatio: 'five' })).toEqual({ cashRatio: 'Enter a number' })
    })
  })

  describe('bonus pins (SQD-13, D-176)', () => {
    it.each([0, 1, 10, 99])('keeps %s', (pins) => {
      expect(parseCreateSweeper({ ...valid, bonusPins: { [open]: pins } })).toMatchObject({
        success: true,
        data: { bonusPins: { [open]: pins } },
      })
    })

    it.each([undefined, null, ''])('reads %j as 0, and still names the division', (blank) => {
      expect(
        parseCreateSweeper({ ...valid, bonusPins: { [open]: blank, [women]: 6 } }),
      ).toMatchObject({ success: true, data: { bonusPins: { [open]: 0, [women]: 6 } } })
    })

    it.each([
      [-1, 'Bonus pins must be between 0 and 99'],
      [100, 'Bonus pins must be between 0 and 99'],
      [1.5, 'Enter a whole number'],
      ['abc', 'Enter a number'],
    ])('refuses %j for a division, keyed by its id', (pins, message) => {
      expect(errorsOf({ ...valid, bonusPins: { [open]: pins, [women]: 6 } })).toEqual({
        [`bonusPins.${open}`]: message,
      })
    })

    it('refuses a key that is not a division id', () => {
      expect(errorsOf({ ...valid, bonusPins: { open: 10 } })).toEqual({
        bonusPins: 'Bonus pins must be keyed by division id',
      })
    })

    it.each([[[10]], ['10'], [5]])('refuses %j, which is not an object', (bonusPins) => {
      expect(errorsOf({ ...valid, bonusPins })).toEqual({
        bonusPins: 'Send bonus pins as an object of division ids',
      })
    })
  })

  it('refuses a key it does not know, complete included (SQD-07)', () => {
    expect(errorsOf({ ...valid, complete: true, finalsRatio: 5 })).toEqual({
      complete: 'This field is not accepted',
      finalsRatio: 'This field is not accepted',
    })
  })

  it('says what is wrong when the body is not an object', () => {
    expect(parseCreateSweeper([])).toMatchObject({
      success: false,
      message: 'Send the sweeper as a JSON object.',
    })
  })

  it('leads the message with the first problem', () => {
    expect(parseCreateSweeper({ ...valid, games: 0 })).toMatchObject({
      success: false,
      message: 'Check the highlighted fields. Games must be between 1 and 99',
    })
  })
})
