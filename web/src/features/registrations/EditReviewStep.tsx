import { formatSessionDate } from '../../shared/sessionFormat'
import type { Division } from '../divisions/types'
import { formatFee } from '../tournaments/format'
import { bowlerLabels, type DueLine, type RegistrationValues } from './deskForm'
import { netText, type EditChange, type Money } from './editForm'
import type { EditInfo } from './types'
import styles from './AddRegistration.module.css'

interface MoneyTableProps {
  caption: string
  head: string
  total: string
  lines: DueLine[]
}

function MoneyTable({ caption, head, total, lines }: Readonly<MoneyTableProps>) {
  if (lines.length === 0) return null
  const cents = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0)
  return (
    <table className={styles.due}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{head}</th>
          <th scope="col" className={styles.amount}>
            Fee
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.id}>
            <th scope="row">
              {line.kind === 'squad' ? 'Squad' : 'Sweeper'} {formatSessionDate(line.date)}
            </th>
            <td className={styles.amount}>{formatFee(line.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{total}</th>
          <td className={styles.amount}>{formatFee(cents / 100)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

interface EditReviewStepProps {
  name: string
  info: EditInfo
  registration: RegistrationValues
  divisions: Division[]
  bowlerChanges: EditChange[]
  money: Money
  /** Whether anything at all changed. */
  changed: boolean
  removalConfirmed: boolean
  onConfirmRemoval: (confirmed: boolean) => void
}

/** Everything about to be saved, once, before the one Save button (D-197, D-207). */
export function EditReviewStep({
  name,
  info,
  registration,
  divisions,
  bowlerChanges,
  money,
  changed,
  removalConfirmed,
  onConfirmRemoval,
}: Readonly<EditReviewStepProps>) {
  const { registration: stored } = info
  const nameOf = (id: string) => divisions.find((division) => division.id === id)?.name ?? ''
  const moved = registration.divisionId !== stored.divisionId
  const averageNow = registration.average.trim()
  const averageWas = stored.average === null ? '' : String(stored.average)
  const averageChanged = averageNow !== averageWas
  const superChanged = registration.superSweeper !== stored.superSweeper
  const dates = money.refund.map(
    (line) => `${line.kind === 'squad' ? 'squad' : 'sweeper'} ${formatSessionDate(line.date)}`,
  )
  const hasMoney = money.collect.length > 0 || money.refund.length > 0

  if (!changed) {
    return (
      <section className={styles.review} aria-labelledby="review-heading">
        <h3 id="review-heading">Review changes</h3>
        <p>
          No changes yet. Go back and change something, or <strong>cancel</strong> to leave.
        </p>
      </section>
    )
  }
  return (
    <section className={styles.review} aria-labelledby="review-heading">
      <h3 id="review-heading">Review changes</h3>
      <p>
        <strong>{name}</strong>
      </p>
      {bowlerChanges.length > 0 && (
        <div>
          <p>Changes to the bowler:</p>
          <ul className={styles.changes}>
            {bowlerChanges.map((change) => (
              <li key={change.key}>
                {bowlerLabels[change.key]}: {change.from.trim() === '' ? 'not set' : change.from} →{' '}
                {change.to === '' ? '(cleared)' : change.to}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(moved || averageChanged || superChanged) && (
        <ul className={styles.changes}>
          {moved && (
            <li>
              Moves the registration from {nameOf(stored.divisionId)} to{' '}
              {nameOf(registration.divisionId)}.
            </li>
          )}
          {averageChanged && (
            <li>
              Average: {averageWas === '' ? 'not set' : averageWas} →{' '}
              {averageNow === '' ? '(cleared)' : averageNow}
            </li>
          )}
          {superChanged && (
            <li>Super sweeper: turned {registration.superSweeper ? 'on' : 'off'}.</li>
          )}
        </ul>
      )}
      <MoneyTable
        caption="What to collect for the added entries"
        head="Added"
        total="To collect"
        lines={money.collect}
      />
      <MoneyTable
        caption="Refund may be due (handled outside the app)"
        head="Removed"
        total="To refund"
        lines={money.refund}
      />
      {hasMoney && (
        <p>
          <strong>{netText(money.net)}</strong>
        </p>
      )}
      {money.refund.length > 0 && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={removalConfirmed}
            onChange={(event) => {
              onConfirmRemoval(event.target.checked)
            }}
          />
          <span>
            I understand this removes {dates.join(' and ')} from the registration and frees the
            lane.
          </span>
        </label>
      )}
      {money.collect.length > 0 && (
        <p className={styles.hint}>
          Take the money at the desk. This app records a $0 desk entry and does not track payments.
        </p>
      )}
    </section>
  )
}
