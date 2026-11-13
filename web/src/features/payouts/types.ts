/**
 * What the payout pages read (PAY-02 to PAY-19). The API's `features/payouts/types.ts` has the same
 * fields: change both together. Money is text with two decimals (`"100.00"`).
 */

export type PayoutSource = 'squad' | 'sweeper' | 'superSweeper' | 'finals'

export interface PayoutView {
  id: string
  amount: string
  note: string | null
  paid: boolean
}

/** A bowler the results say gets paid, or one a director added by hand (D-269). */
export interface SheetPayee {
  registrationId: string
  name: string
  divisionName: string
  /** "cashed, place 9", "seed 2", or "added by hand". */
  detail: string
  seed: number | null
  previousCasher: boolean
  inferred: boolean
  payout: PayoutView | null
}

export interface SheetOther {
  registrationId: string
  name: string
  divisionName: string
}

export type SheetStatus = 'open' | 'notReady' | 'locked'

export interface PayoutSheet {
  event: {
    source: PayoutSource
    eventId: string
    /** "Squad", "Sweeper", "Super sweeper", or "Finals: Open". */
    label: string
    date: string | null
    divisionName: string | null
  }
  status: SheetStatus
  /** Why the sheet is not open (D-272, D-273). `null` when open. */
  reason: string | null
  payees: SheetPayee[]
  others: SheetOther[]
  tournamentComplete: boolean
}

/** One line of the full list (PAY-19). */
export interface PayoutRow {
  id: string
  source: PayoutSource
  eventId: string
  eventLabel: string
  eventDate: string | null
  registrationId: string
  name: string
  divisionName: string
  amount: string
  note: string | null
  paid: boolean
}

export interface PayoutSummary {
  count: number
  total: string
  paidCount: number
  unpaidCount: number
  unpaidTotal: string
}

export interface PayoutList {
  payouts: PayoutRow[]
  summary: PayoutSummary
  tournamentComplete: boolean
}

export interface BowlerTotal {
  registrationId: string
  name: string
  divisionName: string
  count: number
  total: string
  unpaidTotal: string
}

/** What a save sends for one bowler (PAY-12). A blank `amount` means no payout (D-270). */
export interface SaveRow {
  registrationId: string
  amount: string
  note: string | null
  paid: boolean
}

/** A paid payout a save would change, for the confirm (D-273). `to` is `null` for a delete. */
export interface PaidChange {
  registrationId: string
  name: string
  from: string
  to: string | null
}
