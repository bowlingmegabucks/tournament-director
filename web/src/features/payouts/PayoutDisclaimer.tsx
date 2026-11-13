import styles from './Payouts.module.css'

/** What every payout screen says (PAY-14, D-283): the amounts are for one event, so they never overlap. */
export const disclaimerHeading = 'Payouts are for this event only.'
export const disclaimerText =
  'Enter only what this event paid. Do not include cashes from other squads, sweepers, or the finals.'

export function PayoutDisclaimer() {
  return (
    <p className={styles.disclaimer}>
      <strong>{disclaimerHeading}</strong> {disclaimerText}
    </p>
  )
}
