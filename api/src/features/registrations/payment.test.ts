import { describe, expect, it } from 'vitest'
import { isPaidRequest, toNewPayment } from './payment.ts'

const payment = (processingSystem: string, amount: number) => ({
  processingSystem,
  confirmationCode: 'abc',
  amount,
})

describe('isPaidRequest (D-106)', () => {
  it('is paid for a real processor and an amount above 0', () => {
    expect(isPaidRequest(payment('Stripe', 25))).toBe(true)
  })

  it('is not paid with no payment', () => {
    expect(isPaidRequest(null)).toBe(false)
    expect(isPaidRequest(undefined)).toBe(false)
  })

  it('is not paid for the Manual placeholder, whatever the amount', () => {
    expect(isPaidRequest(payment('Manual', 25))).toBe(false)
  })

  it('is not paid at an amount of 0 or less', () => {
    expect(isPaidRequest(payment('Stripe', 0))).toBe(false)
    expect(isPaidRequest(payment('Stripe', -1))).toBe(false)
  })

  it('is paid at the smallest amount above 0', () => {
    expect(isPaidRequest(payment('Stripe', 0.01))).toBe(true)
  })
})

describe('toNewPayment (PAY-02, PAY-04)', () => {
  it('joins the system and code, and uses the id, amount, and server time given', () => {
    const now = new Date('2026-11-02T12:00:00Z')

    expect(toNewPayment(payment('Stripe', 25), 'id-1', now)).toEqual({
      id: 'id-1',
      confirmationCode: 'Stripe_abc',
      amount: 25,
      createdAtUtc: now,
    })
  })
})
