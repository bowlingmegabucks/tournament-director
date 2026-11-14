import { formatCents } from './money.ts'
import type { BowlerTotal, PayoutSummary } from './types.ts'

/** One saved payout with who it is for, as the totals read it. */
export interface TotalInput {
  registrationId: string
  name: string
  divisionName: string
  amountCents: number
  paid: boolean
}

/**
 * The total of each bowler across every event of the tournament (PAY-19, D-276, D-282), highest
 * first, then by name. `minCents` keeps the bowlers whose total is at least that much. Each event's
 * payout holds only what that event paid (D-267), so the plain sum is the bowler's earnings.
 */
export function totalsByBowler(rows: readonly TotalInput[], minCents = 0): BowlerTotal[] {
  const byBowler = new Map<
    string,
    { name: string; divisionName: string; count: number; total: number; unpaid: number }
  >()
  for (const row of rows) {
    const found = byBowler.get(row.registrationId) ?? {
      name: row.name,
      divisionName: row.divisionName,
      count: 0,
      total: 0,
      unpaid: 0,
    }
    found.count += 1
    found.total += row.amountCents
    if (!row.paid) found.unpaid += row.amountCents
    byBowler.set(row.registrationId, found)
  }
  return [...byBowler.entries()]
    .filter(([, bowler]) => bowler.total >= minCents)
    .toSorted(([, a], [, b]) => b.total - a.total || a.name.localeCompare(b.name))
    .map(([registrationId, bowler]) => ({
      registrationId,
      name: bowler.name,
      divisionName: bowler.divisionName,
      count: bowler.count,
      total: formatCents(bowler.total),
      unpaidTotal: formatCents(bowler.unpaid),
    }))
}

/** The counts and sums above the list (PAY-19). */
export function summarize(rows: readonly { amountCents: number; paid: boolean }[]): PayoutSummary {
  let total = 0
  let unpaidTotal = 0
  let unpaidCount = 0
  for (const row of rows) {
    total += row.amountCents
    if (!row.paid) {
      unpaidTotal += row.amountCents
      unpaidCount += 1
    }
  }
  return {
    count: rows.length,
    total: formatCents(total),
    paidCount: rows.length - unpaidCount,
    unpaidCount,
    unpaidTotal: formatCents(unpaidTotal),
  }
}
