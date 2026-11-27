import { formatMoney } from '../../shared/formatMoney'
import styles from './ResultsTable.module.css'

/**
 * What a casher (or a finalist) won in this event, under the name (PAY-20, D-284). A youth's money
 * reads "SMART scholarship", not "Payout" (SMT-03). Nothing when no
 * payout is saved, so a page looks as before until a director saves. It lives in the name cell so
 * every layout carries it unchanged: the table, the phone card, the TV row, and the printed page.
 */
export function PayoutTag({
  amount,
  smartScholarship = false,
}: Readonly<{ amount: string | null; smartScholarship?: boolean }>) {
  if (amount === null) return null
  return (
    <span className={styles.payout}>
      {smartScholarship ? 'SMART scholarship' : 'Payout'} {formatMoney(amount)}
    </span>
  )
}
