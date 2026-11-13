import { centsFromText, formatCents, parseAmount } from './money.ts'
import { maxNoteLength, type PayoutSource } from './types.ts'

/**
 * The save rules of one event's payouts (PAY-06, PAY-07, PAY-10 to PAY-12, D-269 to D-273). Storage
 * reads the facts inside its serializable transaction and applies the plan; this file decides.
 */

/** What opens an event for payouts (D-272). */
export type Gate =
  | { kind: 'squad' | 'sweeper'; complete: boolean }
  | { kind: 'superSweeper'; sweepers: number; open: number }
  | { kind: 'finals'; squads: number; open: number }

export const lockedMessage = 'This tournament is complete. Payouts are locked.'
export const needsNoteMessage = 'Say why this bowler is paid'
export const notEnteredMessage = 'This bowler is not entered in this event'
export const noteTooLongMessage = `Note can be at most ${maxNoteLength} characters`
export const noteNotTextMessage = 'Note must be text'

/** Why the gate is closed, or `null` when it is open (D-272). */
export function gateReason(gate: Gate): string | null {
  switch (gate.kind) {
    case 'squad':
    case 'sweeper':
      return gate.complete
        ? null
        : `This ${gate.kind} is not complete. Complete it before you enter payouts.`
    case 'superSweeper':
      if (gate.sweepers === 0) return 'This tournament has no sweeper'
      if (gate.open === 0) return null
      return gate.open === 1
        ? `1 of ${gate.sweepers} sweepers is not complete. Complete it before you enter super sweeper payouts.`
        : `${gate.open} of ${gate.sweepers} sweepers are not complete. Complete them before you enter super sweeper payouts.`
    case 'finals':
      if (gate.squads === 0) return 'This tournament has no squad'
      if (gate.open === 0) return null
      return gate.open === 1
        ? `1 of ${gate.squads} squads is not complete. Complete it before you enter finals payouts.`
        : `${gate.open} of ${gate.squads} squads are not complete. Complete them before you enter finals payouts.`
  }
}

/** A payout already saved for this event. */
export interface ExistingPayout {
  id: string
  registrationId: string
  /** Money text, `"100.00"`. */
  amount: string
  note: string | null
  paid: boolean
}

/** What a save sends for one bowler. `amount` and `note` are whatever the body held. */
export interface SaveRow {
  registrationId: string
  amount?: unknown
  note?: unknown
  paid?: boolean
}

export interface SaveFacts {
  tournamentComplete: boolean
  gate: Gate
  /** The bowlers the results say get paid (D-268). */
  inferred: ReadonlySet<string>
  /** Everyone entered in the event, by registration id: the name, for messages (D-269). */
  entered: ReadonlyMap<string, string>
  existing: readonly ExistingPayout[]
  confirmPaid: boolean
}

export interface NewPayout {
  registrationId: string
  amountCents: number
  note: string | null
  paid: boolean
}

export interface ChangedPayout {
  id: string
  amountCents: number
  note: string | null
  paid: boolean
}

export interface PaidChange {
  registrationId: string
  name: string
  from: string
  /** `null` when the payout is deleted. */
  to: string | null
}

export type SavePlan =
  /** The tournament is complete or the gate is closed. 409 with `errors.event`. */
  | { kind: 'refused'; reason: string }
  /** A row is wrong. 400 with `errors` keyed `amount:<id>` and `note:<id>`. */
  | { kind: 'invalid'; errors: Record<string, string> }
  /** A paid payout would change and the director has not confirmed (D-273). 409 with `warnings`. */
  | { kind: 'confirm'; paidChanges: PaidChange[] }
  | { kind: 'save'; creates: NewPayout[]; updates: ChangedPayout[]; deletes: string[] }

/**
 * Decide a save. The tournament lock comes first, then the gate (D-272), then each row, then the paid
 * rows that would change (D-273). A row with no amount is a delete, or nothing if no payout exists.
 * A row the request leaves out is untouched (D-278).
 */
export function planSave(facts: SaveFacts, rows: readonly SaveRow[]): SavePlan {
  if (facts.tournamentComplete) return { kind: 'refused', reason: lockedMessage }
  const closed = gateReason(facts.gate)
  if (closed) return { kind: 'refused', reason: closed }

  const existingBy = new Map(facts.existing.map((payout) => [payout.registrationId, payout]))
  const errors: Record<string, string> = {}
  const creates: NewPayout[] = []
  const updates: ChangedPayout[] = []
  const deletes: string[] = []
  const paidChanges: PaidChange[] = []
  const nameOf = (id: string) => facts.entered.get(id) ?? 'Bowler'

  for (const row of rows) {
    const id = row.registrationId
    const existing = existingBy.get(id)
    const amount = parseAmount(row.amount)

    if (amount.kind === 'blank') {
      if (!existing) continue
      deletes.push(existing.id)
      if (existing.paid)
        paidChanges.push({ registrationId: id, name: nameOf(id), from: existing.amount, to: null })
      continue
    }
    if (amount.kind === 'invalid') {
      errors[`amount:${id}`] = amount.message
      continue
    }
    if (!facts.entered.has(id)) {
      errors[`amount:${id}`] = notEnteredMessage
      continue
    }

    const note = readNote(row.note)
    if (note.kind === 'invalid') {
      errors[`note:${id}`] = note.message
      continue
    }
    // D-269: a bowler the results did not infer needs a reason.
    if (note.value === null && !facts.inferred.has(id)) {
      errors[`note:${id}`] = needsNoteMessage
      continue
    }

    if (!existing) {
      creates.push({
        registrationId: id,
        amountCents: amount.cents,
        note: note.value,
        paid: row.paid ?? false,
      })
      continue
    }
    const paid = row.paid ?? existing.paid
    const moved = amount.cents !== centsFromText(existing.amount)
    if (!moved && note.value === existing.note && paid === existing.paid) continue
    updates.push({ id: existing.id, amountCents: amount.cents, note: note.value, paid })
    if (existing.paid && moved) {
      paidChanges.push({
        registrationId: id,
        name: nameOf(id),
        from: existing.amount,
        to: formatCents(amount.cents),
      })
    }
  }

  if (Object.keys(errors).length > 0) return { kind: 'invalid', errors }
  if (paidChanges.length > 0 && !facts.confirmPaid) return { kind: 'confirm', paidChanges }
  return { kind: 'save', creates, updates, deletes }
}

type ReadNote = { kind: 'ok'; value: string | null } | { kind: 'invalid'; message: string }

/** A note is trimmed; blank means none. */
function readNote(input: unknown): ReadNote {
  if (input === null || input === undefined) return { kind: 'ok', value: null }
  if (typeof input !== 'string') return { kind: 'invalid', message: noteNotTextMessage }
  const text = input.trim()
  if (text.length > maxNoteLength) return { kind: 'invalid', message: noteTooLongMessage }
  return { kind: 'ok', value: text === '' ? null : text }
}

/** The key of a payout's source in the `Payouts` table and the URLs. */
export const sourcePaths: Record<PayoutSource, string> = {
  squad: 'squad',
  sweeper: 'sweeper',
  superSweeper: 'super-sweeper',
  finals: 'finals',
}
