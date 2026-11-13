import { describe, expect, it } from 'vitest'
import {
  badAmountMessage,
  centsFromText,
  formatCents,
  needsAmountMessage,
  parseAmount,
  tooMuchMessage,
} from './money.ts'

describe('parseAmount (PAY-07)', () => {
  it.each([
    ['100', 10000],
    ['100.5', 10050],
    ['100.50', 10050],
    ['0.01', 1],
    ['$1,250.75', 125075],
    [' 25 ', 2500],
    ['99999.99', 9999999],
    [100, 10000],
    [12.5, 1250],
  ])('reads %j as %i cents', (input, cents) => {
    expect(parseAmount(input)).toEqual({ kind: 'amount', cents })
  })

  it.each([[''], ['   '], [null], [undefined]])('reads %j as blank, meaning no payout', (input) => {
    expect(parseAmount(input)).toEqual({ kind: 'blank' })
  })

  it.each([['0'], ['0.00'], ['-5'], ['-0.50'], [0], [-3]])(
    'refuses %j as not above zero',
    (input) => {
      expect(parseAmount(input)).toEqual({ kind: 'invalid', message: needsAmountMessage })
    },
  )

  it.each([['100000'], ['100000.00'], ['123456789012'], [100000]])(
    'refuses %j as over the limit',
    (input) => {
      const parsed = parseAmount(input)
      expect(parsed).toEqual({ kind: 'invalid', message: tooMuchMessage })
    },
  )

  it.each([['abc'], ['1.234'], ['1.'], ['.5'], ['1e3'], ['12 34'], [100.005], [true], [{}], [NaN]])(
    'refuses %j as not dollars and cents',
    (input) => {
      expect(parseAmount(input)).toEqual({ kind: 'invalid', message: badAmountMessage })
    },
  )
})

describe('formatCents and centsFromText', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [10000, '100.00'],
    [9999999, '99999.99'],
  ])('writes %i cents as %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text)
  })

  it.each([
    ['100.00', 10000],
    ['100', 10000],
    ['0.5', 50],
    ['12.345', 1234],
  ])('reads %s as %i cents', (text, cents) => {
    expect(centsFromText(text)).toBe(cents)
  })
})
