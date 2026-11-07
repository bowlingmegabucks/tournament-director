import { describe, expect, it } from 'vitest'
import {
  dateProblem,
  hasAtMostDecimals,
  numberOfLanesProblem,
  parse,
  perPairProblem,
  startingLaneProblem,
  whole,
} from './sessionValidation'

const dates = { startDate: '2026-10-23', endDate: '2026-10-25' }

describe('parse', () => {
  it('reads blank, a number, and not a number', () => {
    expect(parse('  ')).toEqual({ blank: true })
    expect(parse(' 12.5 ')).toEqual({ value: 12.5 })
    expect(parse('.5')).toEqual({ value: 0.5 })
    expect(parse('12a')).toEqual({ error: 'Enter a number' })
  })
})

describe('hasAtMostDecimals', () => {
  it('allows floating point error and refuses an extra place', () => {
    expect(hasAtMostDecimals(6.25, 2)).toBe(true)
    expect(hasAtMostDecimals(7.55, 2)).toBe(true)
    expect(hasAtMostDecimals(6.255, 2)).toBe(false)
  })
})

describe('whole', () => {
  it('gives each failure its own message', () => {
    expect(whole('Lanes', '')).toEqual({ error: 'Lanes is required' })
    expect(whole('Lanes', 'x')).toEqual({ error: 'Enter a number' })
    expect(whole('Lanes', '2.5')).toEqual({ error: 'Enter a whole number' })
    expect(whole('Lanes', '4')).toEqual({ value: 4 })
  })
})

describe('startingLaneProblem (SQD-04)', () => {
  it('needs an odd lane from 1 to 199', () => {
    expect(startingLaneProblem('1')).toBeUndefined()
    expect(startingLaneProblem('199')).toBeUndefined()
    expect(startingLaneProblem('2')).toBe('Starting lane must be odd')
    expect(startingLaneProblem('0')).toBe('Starting lane must be between 1 and 199')
    expect(startingLaneProblem('201')).toBe('Starting lane must be between 1 and 199')
    expect(startingLaneProblem('')).toBe('Starting lane is required')
  })
})

describe('numberOfLanesProblem (SQD-05)', () => {
  it('needs an even count from 2 to 200', () => {
    expect(numberOfLanesProblem('2')).toBeUndefined()
    expect(numberOfLanesProblem('200')).toBeUndefined()
    expect(numberOfLanesProblem('3')).toBe('Number of lanes must be even')
    expect(numberOfLanesProblem('0')).toBe('Number of lanes must be between 2 and 200')
    expect(numberOfLanesProblem('202')).toBe('Number of lanes must be between 2 and 200')
  })
})

describe('perPairProblem (SQD-06)', () => {
  it('needs 2 to 5', () => {
    expect(perPairProblem('2')).toBeUndefined()
    expect(perPairProblem('5')).toBeUndefined()
    expect(perPairProblem('1')).toBe('Max per pair must be between 2 and 5')
    expect(perPairProblem('6')).toBe('Max per pair must be between 2 and 5')
    expect(perPairProblem('')).toBe('Max per pair is required')
  })
})

describe('dateProblem (SQD-03, SQD-10)', () => {
  it('needs a real date and time inside the tournament, named for the subject', () => {
    expect(dateProblem('2026-10-23T09:00', dates, 'Squad')).toBeUndefined()
    expect(dateProblem('2026-10-25T23:59', dates, 'Squad')).toBeUndefined()
    expect(dateProblem(' ', dates, 'Squad')).toBe('Date and time is required')
    expect(dateProblem('2026-02-30T09:00', dates, 'Squad')).toBe('Enter a date and time')
    expect(dateProblem('tomorrow', dates, 'Squad')).toBe('Enter a date and time')
    expect(dateProblem('2026-10-22T09:00', dates, 'Squad')).toBe(
      'Squad date must be after tournament start',
    )
    expect(dateProblem('2026-10-26T09:00', dates, 'Sweeper')).toBe(
      'Sweeper date must be before tournament end',
    )
  })

  it('skips the range while the tournament dates have not loaded', () => {
    expect(dateProblem('2020-01-01T09:00', undefined, 'Squad')).toBeUndefined()
  })
})
