import { z } from 'zod'

/**
 * The payout types (D-267). `web/src/features/payouts/types.ts` expects the sheet, list, and totals
 * shapes. Change both together. Web only, never vendor-visible (D-09). Money crosses the wire as
 * text with two decimals (`"100.00"`); inside the API it is whole cents (`money.ts`).
 */

export const payoutSources = ['squad', 'sweeper', 'superSweeper', 'finals'] as const
export type PayoutSource = (typeof payoutSources)[number]

/** The most rows one save may hold (PAY-12). A tournament has far fewer bowlers than this. */
export const maxSaveRows = 500
export const maxNoteLength = 200

/** A saved payout, as storage holds it. */
export interface PayoutRecord {
  id: string
  tournamentId: string
  source: PayoutSource
  eventId: string
  registrationId: string
  amountCents: number
  note: string | null
  paid: boolean
}

/** What a save sends for one bowler (PAY-12). A blank `amount` means no payout (D-270). */
export const saveRowSchema = z.object({
  registrationId: z.uuid(),
  amount: z.union([z.string(), z.number(), z.null()]).optional(),
  note: z.union([z.string(), z.null()]).optional(),
  paid: z.boolean().optional(),
})

export const saveBodySchema = z
  .object({
    payouts: z.array(saveRowSchema).max(maxSaveRows),
    /** The director ticked "I know this was already paid out" (D-273). */
    confirmPaid: z.boolean().optional(),
  })
  .refine(
    (body) => new Set(body.payouts.map((row) => row.registrationId)).size === body.payouts.length,
    { message: 'A bowler can appear only once in a save.' },
  )

export type SaveBody = z.infer<typeof saveBodySchema>

/** `PATCH /payouts/{payoutId}` (D-274). */
export const paidBodySchema = z.object({ paid: z.boolean() })

/** A bowler the results say gets paid (D-268). */
export interface Payee {
  registrationId: string
  name: string
  divisionName: string
  /** "cashed, place 9" or "seed 2": what the sheet shows under the name. */
  detail: string
  /** Finals only: the seed. */
  seed: number | null
  /** Finals only: the bowler cashed on a squad earlier (D-07). */
  previousCasher: boolean
}

/** A saved payout as the sheet and the list show it. */
export interface PayoutView {
  id: string
  amount: string
  note: string | null
  paid: boolean
}

export interface SheetPayee extends Payee {
  /** False for a bowler a director added by hand (D-269). */
  inferred: boolean
  payout: PayoutView | null
}

export interface SheetOther {
  registrationId: string
  name: string
  divisionName: string
}

export type SheetStatus = 'open' | 'notReady' | 'locked'

/** The entry sheet of one event (PAY-02 to PAY-06). */
export interface PayoutSheet {
  event: { source: PayoutSource; eventId: string; label: string; divisionName: string | null }
  status: SheetStatus
  /** Why the sheet is not open: the gate (D-272) or the lock (D-273). `null` when open. */
  reason: string | null
  payees: SheetPayee[]
  others: SheetOther[]
  tournamentComplete: boolean
}

/** One line of `GET /payouts` (PAY-19). */
export interface PayoutRow {
  id: string
  source: PayoutSource
  eventId: string
  /** "Sat 9:00 AM squad" and so on: what the page groups and filters by. */
  eventLabel: string
  registrationId: string
  name: string
  divisionName: string
  amount: string
  note: string | null
  paid: boolean
  /** False when a director added the bowler by hand (D-269). */
  inferred: boolean
}

export interface PayoutSummary {
  count: number
  total: string
  paidCount: number
  unpaidCount: number
  unpaidTotal: string
}

export interface BowlerTotal {
  registrationId: string
  name: string
  divisionName: string
  count: number
  total: string
  unpaidTotal: string
}
