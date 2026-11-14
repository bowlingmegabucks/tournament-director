import { describe, expect, it } from 'vitest'
import {
  addedRow,
  fillAmount,
  isDirty,
  needsNoteMessage,
  rowsOf,
  sameAmountTargets,
  saveRowsOf,
  totalOf,
  validateRows,
  type RowState,
} from './sheetForm'
import { createPayee, createSheet } from '../../mocks/data'

const row = (overrides: Partial<RowState> = {}): RowState => ({
  registrationId: 'r1',
  name: 'Dana Whitfield',
  divisionName: 'Open',
  detail: 'cashed, place 9',
  inferred: true,
  amount: '',
  note: '',
  paid: false,
  ticked: false,
  noteOpen: false,
  payoutId: null,
  saved: null,
  ...overrides,
})

describe('rowsOf (PAY-02, PAY-06)', () => {
  it('turns each payee into a row, with saved amounts, and the note open for a bowler added by hand', () => {
    const sheet = createSheet({
      payees: [
        createPayee({ registrationId: 'a', payout: null }),
        createPayee({
          registrationId: 'b',
          inferred: false,
          payout: { id: 'p1', amount: '25.00', note: 'Lane breakdown', paid: true },
        }),
      ],
    })

    const rows = rowsOf(sheet)

    expect(rows[0]).toMatchObject({
      amount: '',
      note: '',
      noteOpen: false,
      payoutId: null,
      saved: null,
    })
    expect(rows[1]).toMatchObject({
      amount: '25.00',
      note: 'Lane breakdown',
      paid: true,
      noteOpen: true,
      payoutId: 'p1',
      saved: { amount: '25.00', note: 'Lane breakdown', paid: true },
    })
  })
})

describe('addedRow (PAY-06, D-269)', () => {
  it('starts blank, not inferred, with the note open', () => {
    expect(
      addedRow({ registrationId: 'x', name: 'Tom Becker', divisionName: 'Open' }),
    ).toMatchObject({
      inferred: false,
      amount: '',
      noteOpen: true,
      detail: 'added by hand',
    })
  })
})

describe('sameAmountTargets and fillAmount (PAY-08, D-270)', () => {
  const rows = [
    row({ registrationId: 'a', inferred: true, ticked: false }),
    row({ registrationId: 'b', inferred: true, ticked: true }),
    row({ registrationId: 'c', inferred: false, ticked: true }),
  ]

  it('targets every inferred bowler of a squad, sweeper, or super sweeper', () => {
    for (const source of ['squad', 'sweeper', 'superSweeper'] as const) {
      expect(sameAmountTargets(source, rows).map((item) => item.registrationId)).toEqual(['a', 'b'])
    }
  })

  it('targets only the ticked rows of the finals', () => {
    expect(sameAmountTargets('finals', rows).map((item) => item.registrationId)).toEqual(['b', 'c'])
  })

  it('fills the targets and leaves the rest as they were', () => {
    const targets = sameAmountTargets('squad', rows)

    const withTyped = rows.map((item, index) => (index === 0 ? { ...item, amount: '5' } : item))
    const filled = fillAmount(withTyped, targets, '100')

    expect(filled.map((item) => item.amount)).toEqual(['100', '100', ''])
  })
})

describe('saveRowsOf (PAY-07, PAY-12)', () => {
  it('sends rows with an amount, and rows with a saved payout even when cleared', () => {
    const rows = [
      row({ registrationId: 'a', amount: ' 100 ', note: '  ' }),
      row({
        registrationId: 'b',
        amount: '',
        payoutId: 'p2',
        saved: { amount: '50.00', note: '', paid: true },
        paid: true,
      }),
      row({ registrationId: 'c', amount: '', note: 'typed, no amount' }),
    ]

    expect(saveRowsOf(rows)).toEqual([
      { registrationId: 'a', amount: '100', note: null },
      { registrationId: 'b', amount: '', note: null },
    ])
  })

  it('sends paid only when the director moved the tick', () => {
    const saved = { amount: '50.00', note: '', paid: false }
    const rows = [
      row({ registrationId: 'new-ticked', amount: '10', paid: true }),
      row({ registrationId: 'new-plain', amount: '10', paid: false }),
      row({ registrationId: 'kept', amount: '50', payoutId: 'p1', saved, paid: false }),
      row({ registrationId: 'ticked', amount: '50', payoutId: 'p2', saved, paid: true }),
      row({
        registrationId: 'unticked',
        amount: '50',
        payoutId: 'p3',
        saved: { ...saved, paid: true },
        paid: false,
      }),
    ]

    expect(saveRowsOf(rows).map((item) => [item.registrationId, item.paid])).toEqual([
      ['new-ticked', true],
      ['new-plain', undefined],
      ['kept', undefined],
      ['ticked', true],
      ['unticked', false],
    ])
  })
})

describe('validateRows (PAY-06, PAY-07)', () => {
  it('names a bad amount and a missing or long note next to its row, as the API does', () => {
    const rows = [
      row({ registrationId: 'a', amount: '-1' }),
      row({ registrationId: 'b', amount: '25', inferred: false }),
      row({ registrationId: 'c', amount: '25', inferred: false, note: 'x'.repeat(201) }),
      row({ registrationId: 'd', amount: '', inferred: false }),
      row({ registrationId: 'e', amount: '10', inferred: true }),
    ]

    expect(validateRows(rows)).toEqual({
      'amount:a': 'Enter an amount above $0.00',
      'note:b': needsNoteMessage,
      'note:c': 'Note can be at most 200 characters',
    })
  })
})

describe('totalOf', () => {
  it('adds the rows that read as money and counts them', () => {
    const rows = [
      row({ amount: '100' }),
      row({ amount: '25.5' }),
      row({ amount: 'abc' }),
      row({ amount: '' }),
    ]

    expect(totalOf(rows)).toEqual({ cents: 12550, count: 2 })
  })
})

describe('isDirty', () => {
  it('is false for a sheet as loaded, and true once an amount, a note, Paid, or a new row changes', () => {
    const saved = row({
      amount: '100.00',
      saved: { amount: '100.00', note: '', paid: false },
      payoutId: 'p',
    })
    expect(isDirty([saved], 1)).toBe(false)
    expect(isDirty([{ ...saved, amount: '90' }], 1)).toBe(true)
    expect(isDirty([{ ...saved, note: 'why' }], 1)).toBe(true)
    expect(isDirty([{ ...saved, paid: true }], 1)).toBe(true)
    expect(isDirty([row({ amount: '5' })], 1)).toBe(true)
    expect(isDirty([row()], 1)).toBe(false)
    expect(isDirty([saved, row({ registrationId: 'new' })], 1)).toBe(true)
  })
})
