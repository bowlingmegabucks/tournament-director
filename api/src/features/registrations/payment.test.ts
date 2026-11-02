import { describe, expect, it } from 'vitest'
import { isPaidRequest, toNewPayment } from './payment.ts'

const payment = (processingSystem: string, amount: number, confirmationCode = 'abc') => ({
  processingSystem,
  confirmationCode,
  amount,
})

describe('isPaidRequest (D-106)', () => {
  it.each([
    ['a real processor and an amount above 0', payment('Stripe', 25), true],
    ['the smallest amount the column keeps', payment('Stripe', 0.01), true],
    ['the Manual placeholder, whatever the amount', payment('Manual', 25), false],
    ['an amount of 0', payment('Stripe', 0), false],
    ['an amount that rounds to $0.00', payment('Stripe', 0.004), false],
    ['no payment (null)', null, false],
    ['no payment (undefined)', undefined, false],
  ])('%s', (_name, input, expected) => {
    expect(isPaidRequest(input)).toBe(expected)
  })

  it('matches Manual exactly: another casing is a real processor', () => {
    expect(isPaidRequest(payment('manual', 25))).toBe(true)
  })
})

describe('toNewPayment (PAY-02, PAY-04)', () => {
  const now = new Date('2026-11-02T12:00:00Z')

  it('joins the system and code, and uses the id, amount, and server time given', () => {
    expect(toNewPayment(payment('Stripe', 25), 'id-1', now)).toEqual({
      id: 'id-1',
      confirmationCode: 'Stripe_abc',
      amount: 25,
      createdAtUtc: now,
    })
  })

  it('keeps an underscore inside the code and joins with exactly one', () => {
    expect(toNewPayment(payment('Stripe', 25, 'a_b'), 'id-1', now).confirmationCode).toBe(
      'Stripe_a_b',
    )
  })

  it('stores the longest code the schema allows whole (PAY-03, 43 characters)', () => {
    const code = 'x'.repeat(43 - 'Manual_'.length)

    const stored = toNewPayment(payment('Manual', 0, code), 'id-1', now).confirmationCode

    expect(stored).toHaveLength(43)
    expect(stored).toBe(`Manual_${code}`)
  })
})
