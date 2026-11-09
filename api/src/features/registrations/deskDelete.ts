/** One squad or sweeper entry on the registration, with what it costs (D-212). */
export interface DeskDeleteEntry {
  id: string
  kind: 'squad' | 'sweeper'
  /** The center's local time, `YYYY-MM-DDTHH:mm:ss`. */
  date: string
  /** The squad's own fee or the tournament's (TRN-12); a sweeper's fee. */
  entryFee: number
}

/** A payment the registration site took (D-210). `system` is the part of the code before `_`. */
export interface DeskDeletePayment {
  system: string
  amount: number
}

/** What a desk delete depends on. Storage fills it in, inside its transaction (D-211). */
export interface DeskDeleteFacts {
  bowlerName: string
  divisionName: string
  tournamentComplete: boolean
  /** The bowler has any score, squad or sweeper, in this tournament (REG-19). */
  hasScores: boolean
  entries: DeskDeleteEntry[]
  /** Real payments only: a code not starting `Manual_` with an amount above 0 (D-106, D-133). */
  payments: DeskDeletePayment[]
}

/** What `GET …/delete-info` sends (D-212). It never holds a confirmation code. */
export interface DeskDeleteInfo extends DeskDeleteFacts {
  entriesTotal: number
  paidTotal: number
}

const toCents = (amount: number) => Math.round(amount * 100)
const sumOf = (amounts: number[]) => amounts.reduce((sum, amount) => sum + toCents(amount), 0) / 100

export function deskDeleteInfo(facts: DeskDeleteFacts): DeskDeleteInfo {
  return {
    ...facts,
    entriesTotal: sumOf(facts.entries.map((entry) => entry.entryFee)),
    paidTotal: sumOf(facts.payments.map((payment) => payment.amount)),
  }
}

export const completeMessage =
  'This tournament is complete, so its registrations cannot be deleted.'
export const scoresMessage = 'Cannot delete registration with scores.'

/** "$160.00". */
const dollars = (amount: number) => `$${amount.toFixed(2)}`

export function paidMessage(paid: number): string {
  return `This bowler paid ${dollars(paid)} outside this system. Deleting the registration removes the payment records. Any refund is handled outside the app.`
}

/** The warning's field name: delete has no form field, so the one thing it acts on is named. */
export const deleteField = 'registration'

export type DeskDeletePlan =
  /** A fact forbids it (D-211). 409 with `errors`; confirming cannot override it. */
  | { kind: 'refused'; errors: { tournament?: string; scores?: string } }
  /** Allowed, but a real payment goes with it (D-210). 409 with `warnings` and the total. */
  | { kind: 'warn'; message: string; paid: number }
  | { kind: 'delete' }

/**
 * What a desk delete comes to (REG-19, D-210, D-211). `confirmedPaid` is the total the director
 * saw and confirmed. A confirm that no longer matches the stored total warns again, so a payment
 * that arrived since the dialog opened is never deleted unseen.
 */
export function planDeskDelete(
  facts: DeskDeleteFacts,
  confirmedPaid: number | undefined,
): DeskDeletePlan {
  const errors: { tournament?: string; scores?: string } = {}
  if (facts.tournamentComplete) errors.tournament = completeMessage
  if (facts.hasScores) errors.scores = scoresMessage
  if (Object.keys(errors).length > 0) return { kind: 'refused', errors }

  if (facts.payments.length > 0) {
    const paid = deskDeleteInfo(facts).paidTotal
    const confirmed = confirmedPaid !== undefined && toCents(confirmedPaid) === toCents(paid)
    if (!confirmed) return { kind: 'warn', message: paidMessage(paid), paid }
  }
  return { kind: 'delete' }
}
