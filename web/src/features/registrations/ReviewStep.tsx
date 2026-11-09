import { formatSessionDate } from '../../shared/sessionFormat'
import type { Division } from '../divisions/types'
import type { Squad } from '../squads/types'
import type { Sweeper } from '../sweepers/types'
import { formatFee } from '../tournaments/format'
import { bowlerLabels, changesOf, dueLines, totalDue, type RegistrationValues } from './deskForm'
import type { BowlerRegistration, BowlerValues } from './types'
import styles from './AddRegistration.module.css'

interface ReviewStepProps {
  heading: string
  name: string
  bowler: BowlerValues
  /** The stored values of a picked bowler, to show what changed. */
  stored: BowlerValues | undefined
  registration: RegistrationValues
  existing: BowlerRegistration | null
  divisions: Division[]
  squads: Squad[]
  sweepers: Sweeper[]
}

const labelOf = (list: { id: string; date: string }[], ids: string[]) =>
  ids.flatMap((id) => list.find((session) => session.id === id)?.date ?? []).map(formatSessionDate)

/** Everything about to be saved, once, before the one Add button (D-158, D-160, D-165). */
export function ReviewStep({
  heading,
  name,
  bowler,
  stored,
  registration,
  existing,
  divisions,
  squads,
  sweepers,
}: Readonly<ReviewStepProps>) {
  const division = divisions.find((candidate) => candidate.id === registration.divisionId)
  // Stryker disable next-line ArrayDeclaration: with no registration the set only gains a text no session has.
  const held = new Set([...(existing?.squadIds ?? []), ...(existing?.sweeperIds ?? [])])
  const newSquads = labelOf(
    squads,
    registration.squadIds.filter((id) => !held.has(id)),
  )
  const newSweepers = labelOf(
    sweepers,
    registration.sweeperIds.filter((id) => !held.has(id)),
  )
  const changes = stored ? changesOf(stored, bowler) : []
  const due = dueLines({ registration, existing, squads, sweepers })
  const moves = existing !== null && division !== undefined && existing.divisionId !== division.id
  return (
    <section className={styles.review} aria-labelledby="review-heading">
      <h3 id="review-heading">{heading}</h3>
      <p>
        <strong>{name}</strong>
        {bowler.usbcId.trim() !== '' && ` · ${bowler.usbcId.trim()}`}
      </p>
      {changes.length > 0 && (
        <div>
          <p>Changes to the bowler:</p>
          <ul className={styles.changes}>
            {changes.map((change) => (
              <li key={change.key}>
                {bowlerLabels[change.key]}: {change.from.trim() === '' ? 'not set' : change.from} →{' '}
                {change.to}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p>
        {existing ? 'Adds to the existing registration' : 'New registration'}
        {division && ` in ${division.name}`}
        {registration.average.trim() !== '' && `, average ${registration.average.trim()}`}.
      </p>
      {moves && (
        <p>
          Moves the registration from {existing.divisionName} to {division.name}.
        </p>
      )}
      <p>
        {newSquads.length === 0 ? 'No new squads.' : `Squads: ${newSquads.join(', ')}.`}{' '}
        {newSweepers.length === 0 ? 'No new sweepers.' : `Sweepers: ${newSweepers.join(', ')}.`}
        {registration.superSweeper && ' Super sweeper.'}
      </p>
      {due.length === 0 ? (
        <p>Nothing to collect.</p>
      ) : (
        <table className={styles.due}>
          <caption>{existing ? 'What to collect for these additions' : 'What to collect'}</caption>
          <thead>
            <tr>
              <th scope="col">For</th>
              <th scope="col" className={styles.amount}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {due.map((line) => (
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
              <th scope="row">Total to collect</th>
              <td className={styles.amount}>{formatFee(totalDue(due))}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <p className={styles.hint}>
        Take the money at the desk. This app records a $0 desk entry and does not track payments.
      </p>
    </section>
  )
}
