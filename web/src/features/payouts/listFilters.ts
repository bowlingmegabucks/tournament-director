import { parseAmount } from './amount'
import type { BowlerTotal, PayoutRow } from './types'

/** The key an event filter uses: the source and the event id. */
export const eventKeyOf = (row: Pick<PayoutRow, 'source' | 'eventId'>) =>
  `${row.source}:${row.eventId}`

export interface EventOption {
  key: string
  label: string
}

/** The events that hold a payout, in the order the API lists them, each once. A squad or sweeper has its date. */
export function eventOptions(
  rows: readonly PayoutRow[],
  dateText: (value: string) => string,
): EventOption[] {
  const found = new Map<string, string>()
  for (const row of rows) {
    const key = eventKeyOf(row)
    if (found.has(key)) continue
    found.set(key, row.eventDate ? `${row.eventLabel} ${dateText(row.eventDate)}` : row.eventLabel)
  }
  return [...found].map(([key, label]) => ({ key, label }))
}

export type PaidFilter = 'all' | 'unpaid' | 'paid'

/** The rows of one event (or all) that are paid, not paid, or either (PAY-19, D-276). */
export function filterRows(
  rows: readonly PayoutRow[],
  event: string,
  paid: PaidFilter,
): PayoutRow[] {
  return rows.filter(
    (row) =>
      (event === '' || eventKeyOf(row) === event) &&
      (paid === 'all' || (paid === 'paid' ? row.paid : !row.paid)),
  )
}

/** Hold the paid filter to a known word, so a stale or typed value falls back to all. */
export function asPaidFilter(value: string | null): PaidFilter {
  return value === 'paid' || value === 'unpaid' ? value : 'all'
}

export type MinimumResult =
  { kind: 'all' } | { kind: 'invalid'; message: string } | { kind: 'least'; cents: number }

/** Read the "Earned at least" box (PAY-19): blank shows everyone; bad text says what is wrong. */
export function readMinimum(text: string): MinimumResult {
  const parsed = parseAmount(text)
  if (parsed.kind === 'blank') return { kind: 'all' }
  if (parsed.kind === 'invalid') return { kind: 'invalid', message: parsed.message }
  return { kind: 'least', cents: parsed.cents }
}

/** The bowlers whose total is at least the minimum. A total is money text. */
export function atLeast(bowlers: readonly BowlerTotal[], cents: number): BowlerTotal[] {
  return bowlers.filter((bowler) => {
    const total = parseAmount(bowler.total)
    return total.kind === 'amount' && total.cents >= cents
  })
}
