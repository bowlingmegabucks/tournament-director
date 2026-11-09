import { describe, expect, it } from 'vitest'
import {
  completeMessage,
  deskDeleteInfo,
  paidMessage,
  planDeskDelete,
  scoresMessage,
  type DeskDeleteFacts,
} from './deskDelete.ts'
import { isRealPayment, paymentSystem } from './payment.ts'

const facts = (overrides: Partial<DeskDeleteFacts> = {}): DeskDeleteFacts => ({
  bowlerName: 'Maria Gonzalez',
  divisionName: 'Scratch',
  tournamentComplete: false,
  hasScores: false,
  entries: [
    { id: 'a', kind: 'squad', date: '2026-10-23T19:00:00', entryFee: 60 },
    { id: 'b', kind: 'sweeper', date: '2026-10-24T15:00:00', entryFee: 40 },
  ],
  payments: [],
  ...overrides,
})

describe('planDeskDelete (REG-19, D-210, D-211)', () => {
  it('deletes with no payment and no confirm', () => {
    expect(planDeskDelete(facts(), undefined)).toEqual({ kind: 'delete' })
  })

  it('refuses a bowler with scores (REG-19)', () => {
    expect(planDeskDelete(facts({ hasScores: true }), undefined)).toEqual({
      kind: 'refused',
      errors: { scores: scoresMessage },
    })
  })

  it('refuses a complete tournament (D-211)', () => {
    expect(planDeskDelete(facts({ tournamentComplete: true }), undefined)).toEqual({
      kind: 'refused',
      errors: { tournament: completeMessage },
    })
  })

  it('reports both refusals together, and a confirm does not override them (D-211)', () => {
    const both = facts({
      hasScores: true,
      tournamentComplete: true,
      payments: [{ system: 'Site', amount: 100 }],
    })

    expect(planDeskDelete(both, 100)).toEqual({
      kind: 'refused',
      errors: { tournament: completeMessage, scores: scoresMessage },
    })
  })

  it('warns about a real payment, with the total (D-210)', () => {
    const paid = facts({ payments: [{ system: 'Site', amount: 160 }] })

    expect(planDeskDelete(paid, undefined)).toEqual({
      kind: 'warn',
      message: paidMessage(160),
      paid: 160,
    })
    expect(paidMessage(160)).toBe(
      'This bowler paid $160.00 outside this system. Deleting the registration removes the payment records. Any refund is handled outside the app.',
    )
  })

  it('deletes once the confirm matches the total paid (D-210)', () => {
    const paid = facts({
      payments: [
        { system: 'Site', amount: 100.1 },
        { system: 'Site', amount: 59.9 },
      ],
    })

    expect(planDeskDelete(paid, 160)).toEqual({ kind: 'delete' })
  })

  it('warns again when the total changed since the confirm (D-210)', () => {
    const paid = facts({
      payments: [
        { system: 'Site', amount: 160 },
        { system: 'Site', amount: 60 },
      ],
    })

    expect(planDeskDelete(paid, 160)).toEqual({
      kind: 'warn',
      message: paidMessage(220),
      paid: 220,
    })
  })

  it('warns when the confirm is missing even for a one-cent payment (D-210)', () => {
    const paid = facts({ payments: [{ system: 'Site', amount: 0.01 }] })

    expect(planDeskDelete(paid, 0).kind).toBe('warn')
  })
})

describe('deskDeleteInfo (D-212)', () => {
  it('adds up the fees and the payments in whole cents', () => {
    const info = deskDeleteInfo(
      facts({
        entries: [
          { id: 'a', kind: 'squad', date: '2026-10-23T19:00:00', entryFee: 0.1 },
          { id: 'b', kind: 'squad', date: '2026-10-24T19:00:00', entryFee: 0.2 },
        ],
        payments: [{ system: 'Site', amount: 33.33 }],
      }),
    )

    expect(info.entriesTotal).toBe(0.3)
    expect(info.paidTotal).toBe(33.33)
  })

  it('is zero for no entries and no payments', () => {
    expect(deskDeleteInfo(facts({ entries: [] }))).toMatchObject({ entriesTotal: 0, paidTotal: 0 })
  })
})

describe('isRealPayment and paymentSystem (D-106, D-133)', () => {
  it.each([
    ['Site_abc', 60, true],
    ['Site_abc', 0, false],
    ['Site_abc', 0.004, false],
    ['Manual_0190', 60, false],
    ['Manual_0190', 0, false],
    ['manual_x', 10, true],
  ])('%s at %s is real: %s', (code, amount, real) => {
    expect(isRealPayment(code, amount)).toBe(real)
  })

  it('takes the system from the part before the first underscore', () => {
    expect(paymentSystem('BowlingSite_ab_cd')).toBe('BowlingSite')
    expect(paymentSystem('nounderscore')).toBe('nounderscore')
  })
})
