import { describe, expect, it } from 'vitest'
import {
  badAmountMessage,
  formatCents,
  needsAmountMessage,
  parseAmount,
  tooMuchMessage,
} from './amount'

describe('parseAmount (PAY-07)', () => {
  it.each([
    ['100', 10000],
    ['100.5', 10050],
    ['$1,250.75', 125075],
    ['1,000', 100000],
    ['99,999.99', 9999999],
    [' 25 ', 2500],
    ['0.01', 1],
    ['99999.99', 9999999],
  ])('reads %j as %i cents', (input, cents) => {
    expect(parseAmount(input)).toEqual({ kind: 'amount', cents })
  })

  it.each([['1,50'], ['12,5'], ['1,2345'], [',500'], ['1,000,00'], ['1,000,'], ['1,0']])(
    'refuses %j: a comma is a thousands mark only before three digits',
    (input) => {
      expect(parseAmount(input)).toEqual({ kind: 'invalid', message: badAmountMessage })
    },
  )

  it.each([['5$'], ['1-5'], ['-5x'], ['$$5']])(
    'refuses %j as not dollars and cents (a sign or $ in the wrong place)',
    (input) => {
      expect(parseAmount(input)).toEqual({ kind: 'invalid', message: badAmountMessage })
    },
  )

  it.each([['-10'], ['-1,000.50']])(
    'refuses %j, a negative of several digits, as not above zero',
    (input) => {
      expect(parseAmount(input)).toEqual({ kind: 'invalid', message: needsAmountMessage })
    },
  )

  it.each([[''], ['   ']])('reads %j as blank, meaning no payout', (input) => {
    expect(parseAmount(input)).toEqual({ kind: 'blank' })
  })

  it.each([['0'], ['0.00'], ['-5']])('refuses %j as not above zero', (input) => {
    expect(parseAmount(input)).toEqual({ kind: 'invalid', message: needsAmountMessage })
  })

  it.each([['100000'], ['100000.00'], ['123456789012']])('refuses %j as too much', (input) => {
    expect(parseAmount(input)).toEqual({ kind: 'invalid', message: tooMuchMessage })
  })

  it.each([['abc'], ['1.234'], ['1.'], ['.5'], ['1e3']])(
    'refuses %j as not dollars and cents',
    (input) => {
      expect(parseAmount(input)).toEqual({ kind: 'invalid', message: badAmountMessage })
    },
  )
})

describe('formatCents', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [10000, '100.00'],
    [9999999, '99999.99'],
  ])('writes %i cents as %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text)
  })
})
