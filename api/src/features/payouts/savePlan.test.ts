import { describe, expect, it } from 'vitest'
import {
  gateReason,
  lockedMessage,
  needsNoteMessage,
  noteTooLongMessage,
  notEnteredMessage,
  planSave,
  type ExistingPayout,
  type SaveFacts,
} from './savePlan.ts'

const open = { kind: 'squad', complete: true } as const

function facts(overrides: Partial<SaveFacts> = {}): SaveFacts {
  return {
    tournamentComplete: false,
    gate: open,
    inferred: new Set(['a', 'b']),
    entered: new Map([
      ['a', 'Dana Whitfield'],
      ['b', 'Marcus Lee'],
      ['c', 'Tom Becker'],
    ]),
    existing: [],
    confirmPaid: false,
    ...overrides,
  }
}

const paidPayout: ExistingPayout = {
  id: 'p1',
  registrationId: 'a',
  amount: '100.00',
  note: null,
  paid: true,
}

describe('gateReason (PAY-10, D-272)', () => {
  it('opens a complete squad or sweeper and says why an open one is closed', () => {
    expect(gateReason({ kind: 'squad', complete: true })).toBeNull()
    expect(gateReason({ kind: 'squad', complete: false })).toBe(
      'This squad is not complete. Complete it before you enter payouts.',
    )
    expect(gateReason({ kind: 'sweeper', complete: false })).toBe(
      'This sweeper is not complete. Complete it before you enter payouts.',
    )
  })

  it('opens the super sweeper only when every sweeper is complete', () => {
    expect(gateReason({ kind: 'superSweeper', sweepers: 3, open: 0 })).toBeNull()
    expect(gateReason({ kind: 'superSweeper', sweepers: 0, open: 0 })).toBe(
      'This tournament has no sweeper',
    )
    expect(gateReason({ kind: 'superSweeper', sweepers: 3, open: 2 })).toBe(
      '2 of 3 sweepers are not complete. Complete them before you enter super sweeper payouts.',
    )
    expect(gateReason({ kind: 'superSweeper', sweepers: 3, open: 1 })).toBe(
      '1 of 3 sweepers is not complete. Complete it before you enter super sweeper payouts.',
    )
  })

  it('opens the finals only when every squad is complete', () => {
    expect(gateReason({ kind: 'finals', squads: 4, open: 0 })).toBeNull()
    expect(gateReason({ kind: 'finals', squads: 0, open: 0 })).toBe('This tournament has no squad')
    expect(gateReason({ kind: 'finals', squads: 4, open: 2 })).toBe(
      '2 of 4 squads are not complete. Complete them before you enter finals payouts.',
    )
    expect(gateReason({ kind: 'finals', squads: 4, open: 1 })).toBe(
      '1 of 4 squads is not complete. Complete it before you enter finals payouts.',
    )
  })
})

describe('planSave: locks and gates (PAY-10, PAY-11)', () => {
  it('refuses everything once the tournament is complete', () => {
    expect(
      planSave(facts({ tournamentComplete: true }), [{ registrationId: 'a', amount: '1' }]),
    ).toEqual({
      kind: 'refused',
      reason: lockedMessage,
    })
  })

  it('refuses a closed gate before it looks at any row', () => {
    const plan = planSave(facts({ gate: { kind: 'squad', complete: false } }), [
      { registrationId: 'a', amount: 'abc' },
    ])
    expect(plan).toEqual({
      kind: 'refused',
      reason: 'This squad is not complete. Complete it before you enter payouts.',
    })
  })
})

describe('planSave: rows (PAY-06, PAY-07, PAY-12)', () => {
  it('creates a payout for an inferred bowler with no note', () => {
    expect(planSave(facts(), [{ registrationId: 'a', amount: '100' }])).toEqual({
      kind: 'save',
      creates: [{ registrationId: 'a', amountCents: 10000, note: null, paid: false }],
      updates: [],
      deletes: [],
    })
  })

  it('needs a note for a bowler the results did not infer (PAY-06)', () => {
    expect(planSave(facts(), [{ registrationId: 'c', amount: '25', note: '  ' }])).toEqual({
      kind: 'invalid',
      errors: { 'note:c': needsNoteMessage },
    })
  })

  it('takes a trimmed note for a bowler added by hand', () => {
    const plan = planSave(facts(), [
      { registrationId: 'c', amount: '25', note: ' Lane breakdown ' },
    ])
    expect(plan).toMatchObject({
      kind: 'save',
      creates: [{ registrationId: 'c', amountCents: 2500, note: 'Lane breakdown' }],
    })
  })

  it('refuses a bowler who is not entered in the event (PAY-06)', () => {
    expect(planSave(facts(), [{ registrationId: 'z', amount: '25', note: 'why' }])).toEqual({
      kind: 'invalid',
      errors: { 'amount:z': notEnteredMessage },
    })
  })

  it('refuses a note over 200 characters and a note that is not text', () => {
    const plan = planSave(facts(), [
      { registrationId: 'a', amount: '1', note: 'x'.repeat(201) },
      { registrationId: 'b', amount: '1', note: 5 },
    ])
    expect(plan).toEqual({
      kind: 'invalid',
      errors: { 'note:a': noteTooLongMessage, 'note:b': 'Note must be text' },
    })
    expect(
      planSave(facts(), [{ registrationId: 'a', amount: '1', note: 'x'.repeat(200) }]).kind,
    ).toBe('save')
  })

  it('lists every bad amount with its own message, and saves nothing', () => {
    const plan = planSave(facts(), [
      { registrationId: 'a', amount: '-5' },
      { registrationId: 'b', amount: '1000000' },
      { registrationId: 'c', amount: 'abc', note: 'why' },
    ])
    expect(plan).toEqual({
      kind: 'invalid',
      errors: {
        'amount:a': 'Enter an amount above $0.00',
        'amount:b': 'The most you can enter is $99,999.99',
        'amount:c': 'Enter dollars and cents, like 100.00',
      },
    })
  })

  it('ignores a blank row that has no payout, and deletes a blank row that has one', () => {
    const plan = planSave(facts({ existing: [{ ...paidPayout, paid: false }] }), [
      { registrationId: 'a', amount: '' },
      { registrationId: 'b', amount: null },
    ])
    expect(plan).toEqual({ kind: 'save', creates: [], updates: [], deletes: ['p1'] })
  })

  it('changes an amount, a note, or the paid flag, and skips a row that did not change', () => {
    const existing: ExistingPayout[] = [
      { id: 'p1', registrationId: 'a', amount: '100.00', note: null, paid: false },
      { id: 'p2', registrationId: 'b', amount: '100.00', note: null, paid: false },
    ]
    const plan = planSave(facts({ existing }), [
      { registrationId: 'a', amount: '120', paid: true },
      { registrationId: 'b', amount: '100.00', note: null, paid: false },
    ])
    expect(plan).toEqual({
      kind: 'save',
      creates: [],
      updates: [{ id: 'p1', amountCents: 12000, note: null, paid: true }],
      deletes: [],
    })
  })

  it('keeps the saved paid flag when the request leaves it out', () => {
    const plan = planSave(facts({ existing: [paidPayout], confirmPaid: true }), [
      { registrationId: 'a', amount: '150' },
    ])
    expect(plan).toMatchObject({
      kind: 'save',
      updates: [{ id: 'p1', amountCents: 15000, paid: true }],
    })
  })
})

describe('planSave: paid payouts (PAY-12, D-273)', () => {
  it('asks before it changes the amount of a paid payout', () => {
    expect(
      planSave(facts({ existing: [paidPayout] }), [{ registrationId: 'a', amount: '120' }]),
    ).toEqual({
      kind: 'confirm',
      paidChanges: [{ registrationId: 'a', name: 'Dana Whitfield', from: '100.00', to: '120.00' }],
    })
  })

  it('asks before it deletes a paid payout', () => {
    expect(
      planSave(facts({ existing: [paidPayout] }), [{ registrationId: 'a', amount: '' }]),
    ).toEqual({
      kind: 'confirm',
      paidChanges: [{ registrationId: 'a', name: 'Dana Whitfield', from: '100.00', to: null }],
    })
  })

  it('goes ahead once the director confirmed', () => {
    const plan = planSave(facts({ existing: [paidPayout], confirmPaid: true }), [
      { registrationId: 'a', amount: '' },
    ])
    expect(plan).toEqual({ kind: 'save', creates: [], updates: [], deletes: ['p1'] })
  })

  it('does not ask to un-tick Paid or to edit a note on a paid payout', () => {
    const unpaid = planSave(facts({ existing: [paidPayout] }), [
      { registrationId: 'a', amount: '100', paid: false },
    ])
    expect(unpaid).toMatchObject({ kind: 'save', updates: [{ id: 'p1', paid: false }] })
    const noted = planSave(facts({ existing: [paidPayout] }), [
      { registrationId: 'a', amount: '100', note: 'Check #12' },
    ])
    expect(noted).toMatchObject({ kind: 'save', updates: [{ id: 'p1', note: 'Check #12' }] })
  })

  it('does not ask when the amount is the same', () => {
    expect(
      planSave(facts({ existing: [paidPayout] }), [{ registrationId: 'a', amount: '100.00' }]),
    ).toEqual({
      kind: 'save',
      creates: [],
      updates: [],
      deletes: [],
    })
  })
})
