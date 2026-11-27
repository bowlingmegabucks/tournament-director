import type { PayoutAmountRow } from './store.ts'
import type { PayoutSource } from './types.ts'

/**
 * The saved amounts of one event, by registration id (PAY-20, D-284). The results show an amount
 * only on the row of an inferred payee, so the loaders look a row up here and keep the answer only
 * for a `casher` or a `finalist`.
 */
export function amountsFor(
  rows: readonly PayoutAmountRow[],
  source: PayoutSource,
  eventId: string,
): ReadonlyMap<string, PayoutAmountRow> {
  return new Map(
    rows
      .filter((row) => row.source === source && row.eventId === eventId)
      .map((row) => [row.registrationId, row]),
  )
}

/**
 * What a results row carries: the amount, and `smartScholarship` only when that amount is SMART
 * money (SMT-03). A row with no amount says nothing about the bowler.
 */
export function shownPayout(row: PayoutAmountRow | undefined) {
  return {
    payout: row?.amount ?? null,
    ...(row?.smartScholarship && { smartScholarship: true as const }),
  }
}

/** Passed along when one request reads several events, so the table is read once. */
export interface PayoutsOption {
  payouts?: readonly PayoutAmountRow[]
}
