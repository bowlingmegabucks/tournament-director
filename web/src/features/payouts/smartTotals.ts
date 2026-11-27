import { formatMoney } from '../../shared/formatMoney'
import { centsOf, formatCents } from './amount'

/**
 * SMART scholarship money (SMT-03, SMT-04): a youth's winnings go to their SMART account, so every
 * report names it and keeps it out of the cash total.
 */

/** What a payout screen or report says beside such a line. */
export const smartNotice = 'SMART scholarship: do not pay'

/** The part of some payouts that is SMART scholarship money, in cents (SMT-04). */
export function smartCents(
  lines: readonly { amount: string; smartScholarship: boolean }[],
): number {
  return lines.reduce((sum, line) => sum + (line.smartScholarship ? centsOf(line.amount) : 0), 0)
}

const money = (cents: number) => formatMoney(formatCents(cents))

/** "Total $100.00", then "Cash …" and "SMART scholarship …" when any of it is scholarship money. */
export function totalFigures(total: number, smart: number): string[] {
  if (smart === 0) return [`Total ${money(total)}`]
  return [
    `Total ${money(total)}`,
    `Cash ${money(total - smart)}`,
    `SMART scholarship ${money(smart)}`,
  ]
}

/** "$100.00", or "$100.00: $25.00 cash, $75.00 SMART scholarship". */
export function splitMoney(total: number, smart: number): string {
  if (smart === 0) return money(total)
  return `${money(total)}: ${money(total - smart)} cash, ${money(smart)} SMART scholarship`
}
