import { describe, expect, it } from 'vitest'
import { formatMoney } from './formatMoney'

describe('formatMoney (PAY-20)', () => {
  it.each([
    ['100.00', '$100.00'],
    ['100', '$100.00'],
    ['1250.5', '$1,250.50'],
    ['99999.99', '$99,999.99'],
    ['0.05', '$0.05'],
  ])('writes %s as %s', (amount, text) => {
    expect(formatMoney(amount)).toBe(text)
  })

  it.each([[''], ['  '], ['abc']])('leaves %j as it was', (amount) => {
    expect(formatMoney(amount)).toBe(amount)
  })
})
