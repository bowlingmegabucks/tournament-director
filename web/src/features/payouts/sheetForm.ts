import { formatCents, parseAmount } from './amount'
import type { PayoutSheet, PayoutSource, SaveRow, SheetOther } from './types'

/** The most a note may hold (the API says the same, PAY-06). */
export const maxNoteLength = 200

export const needsNoteMessage = 'Say why this bowler is paid'
export const noteTooLongMessage = `Note can be at most ${maxNoteLength} characters`

/** One bowler's boxes in the entry sheet. */
export interface RowState {
  registrationId: string
  name: string
  divisionName: string
  detail: string
  /** False for a bowler a director adds by hand (D-269): the note is then required. */
  inferred: boolean
  amount: string
  note: string
  paid: boolean
  /** Finals only: the tick that says "Same amount for ticked" fills this row (D-270). */
  ticked: boolean
  /** The note box is shown. Always for a hand-added bowler; on request for an inferred one. */
  noteOpen: boolean
  /** The saved payout this row came from, or `null` for a new one. */
  payoutId: string | null
  /** What the row held when the sheet opened, to tell a change from none. */
  saved: { amount: string; note: string; paid: boolean } | null
}

/** The rows of a loaded sheet: the payees, inferred ones first as the API sends them. */
export function rowsOf(sheet: PayoutSheet): RowState[] {
  return sheet.payees.map((payee) => {
    const note = payee.payout?.note ?? ''
    const amount = payee.payout?.amount ?? ''
    const paid = payee.payout?.paid ?? false
    return {
      registrationId: payee.registrationId,
      name: payee.name,
      divisionName: payee.divisionName,
      detail: payee.detail,
      inferred: payee.inferred,
      amount,
      note,
      paid,
      ticked: false,
      noteOpen: !payee.inferred || note !== '',
      payoutId: payee.payout?.id ?? null,
      saved: payee.payout ? { amount, note, paid } : null,
    }
  })
}

/** A bowler added from the search: a row with nothing typed and the note open and required (D-269). */
export function addedRow(other: SheetOther): RowState {
  return {
    registrationId: other.registrationId,
    name: other.name,
    divisionName: other.divisionName,
    detail: 'added by hand',
    inferred: false,
    amount: '',
    note: '',
    paid: false,
    ticked: false,
    noteOpen: true,
    payoutId: null,
    saved: null,
  }
}

/** Who "Same amount" fills (D-270): the ticked rows of the finals, every inferred bowler elsewhere. */
export function sameAmountTargets(source: PayoutSource, rows: readonly RowState[]): RowState[] {
  return rows.filter((row) => (source === 'finals' ? row.ticked : row.inferred))
}

/** Fill the boxes of `targets` with one amount, and leave every other row alone (PAY-08). */
export function fillAmount(
  rows: readonly RowState[],
  targets: readonly RowState[],
  amount: string,
): RowState[] {
  const ids = new Set(targets.map((row) => row.registrationId))
  return rows.map((row) => (ids.has(row.registrationId) ? { ...row, amount } : row))
}

/**
 * What the save sends: every row with an amount, and every row that had a saved payout (a cleared box
 * deletes it, D-270). A row with nothing typed and nothing saved is left out.
 */
export function saveRowsOf(rows: readonly RowState[]): SaveRow[] {
  return rows
    .filter((row) => row.amount.trim() !== '' || row.payoutId !== null)
    .map((row) => ({
      registrationId: row.registrationId,
      amount: row.amount.trim(),
      note: row.note.trim() === '' ? null : row.note.trim(),
      paid: row.paid,
    }))
}

/**
 * Mistakes the browser sees before it asks the API, keyed `amount:<id>` and `note:<id>` like the API
 * (PAY-06, PAY-07). The API checks again.
 */
export function validateRows(rows: readonly RowState[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const row of rows) {
    const amount = parseAmount(row.amount)
    if (amount.kind === 'invalid') errors[`amount:${row.registrationId}`] = amount.message
    if (amount.kind !== 'amount') continue
    const note = row.note.trim()
    if (note.length > maxNoteLength) errors[`note:${row.registrationId}`] = noteTooLongMessage
    else if (note === '' && !row.inferred) errors[`note:${row.registrationId}`] = needsNoteMessage
  }
  return errors
}

/** The sum of the amounts that read as money, and how many rows hold one. */
export function totalOf(rows: readonly RowState[]): { cents: number; count: number } {
  let cents = 0
  let count = 0
  for (const row of rows) {
    const amount = parseAmount(row.amount)
    if (amount.kind !== 'amount') continue
    cents += amount.cents
    count += 1
  }
  return { cents, count }
}

export const totalText = (cents: number) => formatCents(cents)

/** True when a row differs from what was saved, or is new with something typed. */
export function isChanged(row: RowState): boolean {
  if (row.saved === null) return row.amount.trim() !== '' || row.note.trim() !== ''
  return (
    row.amount.trim() !== row.saved.amount ||
    row.note.trim() !== row.saved.note ||
    row.paid !== row.saved.paid
  )
}

/** The sheet holds typed work a Cancel would lose: a changed row, or a bowler added and left blank. */
export function isDirty(rows: readonly RowState[], originalCount: number): boolean {
  return rows.length > originalCount || rows.some(isChanged)
}
