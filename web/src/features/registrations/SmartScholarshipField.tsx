import { smartAgeWarning } from './deskForm'
import styles from './AddRegistration.module.css'

interface SmartScholarshipFieldProps {
  checked: boolean
  /** `YYYY-MM-DD` or `''`, as the date box holds it. */
  dateOfBirth: string
  error: string | undefined
  onChange: (checked: boolean) => void
}

const id = 'smart-scholarship'

/**
 * The youth indicator on the Bowler step (SMT-01): winnings go to the bowler's SMART account. It is
 * kept on the registration, not the bowler, so it is set again for each tournament. A bowler who
 * looks too old gets a warning, not a refusal (SMT-07).
 */
export function SmartScholarshipField({
  checked,
  dateOfBirth,
  error,
  onChange,
}: Readonly<SmartScholarshipFieldProps>) {
  const warning = checked
    ? smartAgeWarning(dateOfBirth, new Date().toLocaleDateString('en-CA'))
    : undefined
  const describedBy = [`${id}-hint`, warning && `${id}-warning`, error && `${id}-error`]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={styles.field}>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={checked}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            onChange(event.target.checked)
          }}
        />
        <span>Youth bowler: winnings go to their SMART account</span>
      </label>
      <p id={`${id}-hint`} className={styles.hint}>
        For this tournament only. Payouts are marked as SMART scholarship, not cash.
      </p>
      {warning && (
        <output id={`${id}-warning`} className={styles.notice}>
          {warning}
        </output>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}
