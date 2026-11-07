import { describe, expect, it } from 'vitest'
import { parseCreateSquad } from './createRequest.ts'

const valid = { date: '2026-10-24T09:00', startingLane: 1, numberOfLanes: 24, maxPerPair: 4 }

function errorsOf(body: unknown): Record<string, string> {
  const result = parseCreateSquad(body)
  if (result.success) throw new Error('expected the body to fail')
  return result.errors
}

describe('parseCreateSquad', () => {
  it('accepts the required fields and stores every override as not set (SQD-08, D-170)', () => {
    expect(parseCreateSquad(valid)).toEqual({
      success: true,
      data: {
        date: '2026-10-24T09:00:00',
        startingLane: 1,
        numberOfLanes: 24,
        maxPerPair: 4,
        entryFee: null,
        finalsRatio: null,
        cashRatio: null,
      },
    })
  })

  it('keeps a fee and both ratios as sent (SQD-02, SQD-08)', () => {
    const result = parseCreateSquad({ ...valid, entryFee: 60, finalsRatio: 5.5, cashRatio: 3 })

    expect(result).toMatchObject({
      success: true,
      data: { entryFee: 60, finalsRatio: 5.5, cashRatio: 3 },
    })
  })

  it.each([undefined, null, ''])('reads %j as an override not set (D-170)', (blank) => {
    expect(
      parseCreateSquad({ ...valid, entryFee: blank, finalsRatio: blank, cashRatio: blank }),
    ).toMatchObject({ success: true, data: { entryFee: null, finalsRatio: null, cashRatio: null } })
  })

  describe('date', () => {
    it.each([
      ['2026-10-24T09:00', '2026-10-24T09:00:00'],
      ['2026-10-24T09:00:00', '2026-10-24T09:00:00'],
      ['2026-10-24T09:00:00.000', '2026-10-24T09:00:00'],
      ['2026-10-24T23:59', '2026-10-24T23:59:00'],
    ])('accepts %s (SQD-03)', (sent, stored) => {
      expect(parseCreateSquad({ ...valid, date: sent })).toMatchObject({
        success: true,
        data: { date: stored },
      })
    })

    it.each([undefined, null, ''])('is required: %j (SQD-03)', (date) => {
      expect(errorsOf({ ...valid, date })).toEqual({ date: 'Date and time is required' })
    })

    it.each([
      '2026-10-24',
      '2026-10-24T09',
      '2026-10-24T09:00:30',
      '2026-10-24T09:00Z',
      '2026-02-30T09:00',
      '2026-10-24T24:00',
      '2026-10-24T09:60',
      'tomorrow',
      42,
    ])('refuses %j (SQD-03)', (date) => {
      expect(errorsOf({ ...valid, date })).toEqual({ date: 'Enter a date and time' })
    })
  })

  describe('starting lane', () => {
    it.each([1, 3, 199])('accepts %i (SQD-06)', (startingLane) => {
      expect(parseCreateSquad({ ...valid, startingLane }).success).toBe(true)
    })

    it.each([
      [2, 'Starting lane must be odd'],
      [4, 'Starting lane must be odd'],
      [0, 'Starting lane must be between 1 and 199'],
      [-1, 'Starting lane must be between 1 and 199'],
      [200, 'Starting lane must be between 1 and 199'],
      [201, 'Starting lane must be between 1 and 199'],
      [1.5, 'Enter a whole number'],
      ['3', 'Enter a number'],
      [undefined, 'Starting lane is required'],
      [null, 'Starting lane is required'],
      ['', 'Starting lane is required'],
    ])('refuses %j (SQD-06, D-168)', (startingLane, message) => {
      expect(errorsOf({ ...valid, startingLane })).toEqual({ startingLane: message })
    })
  })

  describe('number of lanes', () => {
    it.each([2, 24, 200])('accepts %i (SQD-05)', (numberOfLanes) => {
      expect(parseCreateSquad({ ...valid, numberOfLanes }).success).toBe(true)
    })

    it.each([
      [1, 'Number of lanes must be between 2 and 200'],
      [0, 'Number of lanes must be between 2 and 200'],
      [-2, 'Number of lanes must be between 2 and 200'],
      [202, 'Number of lanes must be between 2 and 200'],
      [3, 'Number of lanes must be even'],
      [23, 'Number of lanes must be even'],
      [2.5, 'Enter a whole number'],
      ['24', 'Enter a number'],
      [undefined, 'Number of lanes is required'],
    ])('refuses %j (SQD-05, D-168)', (numberOfLanes, message) => {
      expect(errorsOf({ ...valid, numberOfLanes })).toEqual({ numberOfLanes: message })
    })
  })

  describe('max per pair', () => {
    it.each([2, 3, 4, 5])('accepts %i (SQD-04)', (maxPerPair) => {
      expect(parseCreateSquad({ ...valid, maxPerPair }).success).toBe(true)
    })

    it.each([
      [1, 'Max per pair must be between 2 and 5'],
      [0, 'Max per pair must be between 2 and 5'],
      [6, 'Max per pair must be between 2 and 5'],
      [2.5, 'Enter a whole number'],
      ['4', 'Enter a number'],
      [undefined, 'Max per pair is required'],
    ])('refuses %j (SQD-04, D-168)', (maxPerPair, message) => {
      expect(errorsOf({ ...valid, maxPerPair })).toEqual({ maxPerPair: message })
    })
  })

  describe('entry fee', () => {
    it.each([0, 0.5, 60, 999.99])('accepts %s, a stored 0 included (SQD-08)', (entryFee) => {
      expect(parseCreateSquad({ ...valid, entryFee })).toMatchObject({
        success: true,
        data: { entryFee },
      })
    })

    it.each([
      [-0.01, 'Entry fee must be between $0 and $999.99'],
      [1000, 'Entry fee must be between $0 and $999.99'],
      [999.991, 'Entry fee must be between $0 and $999.99'],
      [60.555, 'Use at most two decimal places'],
      ['sixty', 'Enter a number'],
    ])('refuses %j (SQD-08, D-170)', (entryFee, message) => {
      expect(errorsOf({ ...valid, entryFee })).toEqual({ entryFee: message })
    })
  })

  describe.each([
    ['finalsRatio', 'Finals ratio'],
    ['cashRatio', 'Cash ratio'],
  ])('%s', (field, label) => {
    it.each([1.1, 6, 99.9])('accepts %s (SQD-02)', (value) => {
      expect(parseCreateSquad({ ...valid, [field]: value })).toMatchObject({
        success: true,
        data: { [field]: value },
      })
    })

    it.each([
      [1, `${label} must be greater than 1`],
      [0, `${label} must be greater than 1`],
      [-3, `${label} must be greater than 1`],
      [99.95, `${label} cannot be more than 99.9`],
      [100, `${label} cannot be more than 99.9`],
      [6.25, 'Use at most one decimal place'],
      [1.05, 'Use at most one decimal place'],
      ['six', 'Enter a number'],
    ])('refuses %j (SQD-02, D-170)', (value, message) => {
      expect(errorsOf({ ...valid, [field]: value })).toEqual({ [field]: message })
    })
  })

  it('refuses a key it does not know, `complete` included (SQD-07, D-171)', () => {
    const result = parseCreateSquad({ ...valid, complete: true, games: 5 })

    expect(result).toMatchObject({
      success: false,
      errors: { complete: 'This field is not accepted', games: 'This field is not accepted' },
    })
  })

  it('names every field that fails and starts the message with the first (SQD-04, SQD-05)', () => {
    const result = parseCreateSquad({ ...valid, startingLane: 2, maxPerPair: 9 })

    expect(result).toEqual({
      success: false,
      message: 'Check the highlighted fields. Starting lane must be odd',
      errors: {
        startingLane: 'Starting lane must be odd',
        maxPerPair: 'Max per pair must be between 2 and 5',
      },
    })
  })

  it.each([null, 'text', 5, [valid]])('refuses a body that is not an object: %j', (body) => {
    expect(parseCreateSquad(body)).toEqual({
      success: false,
      message: 'Send the squad as a JSON object.',
      errors: {},
    })
  })
})
