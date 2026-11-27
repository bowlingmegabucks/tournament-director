import { formatMoney } from '../../shared/formatMoney'
import { formatCents, parseAmount } from './amount'

/** Money text as whole cents; 0 for text that is not an amount. */
export function centsOf(amount: string): number {
  const parsed = parseAmount(amount)
  return parsed.kind === 'amount' ? parsed.cents : 0
}

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
