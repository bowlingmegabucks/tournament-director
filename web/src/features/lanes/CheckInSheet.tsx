import { createPortal } from 'react-dom'
import { formatSessionDate } from '../../shared/sessionFormat'
import type { CheckInGroup, CheckInOrder } from './checkIn'
import styles from './CheckInSheet.module.css'
import type { SessionKind } from './types'

interface CheckInSheetProps {
  tournamentName: string
  kind: SessionKind
  /** The session date, `2026-10-24T09:00:00`. */
  date: string
  order: CheckInOrder
  groups: readonly CheckInGroup[]
  /** Today, as text, so a test can fix it. */
  printedOn: string
}

const orderText: Record<CheckInOrder, string> = {
  lane: 'Lane order',
  name: 'Alphabetical by last name',
}

/**
 * The check-in sheet (a printed list with a box to tick for each bowler), on letter paper. It
 * shows the average and the handicap on a squad, or the bonus pins and the super sweeper flag on
 * a sweeper, and a blank Notes column. Black on white whatever the theme. The preview dialog
 * shows it as it is; `CheckInPrintCopy` puts the same sheet in a portal for the printer, like the
 * recap sheets (D-62).
 */
export function CheckInSheet({
  tournamentName,
  kind,
  date,
  order,
  groups,
  printedOn,
}: Readonly<CheckInSheetProps>) {
  const count = groups.reduce((total, group) => total + group.rows.length, 0)
  const sweeper = kind === 'sweeper'
  const columns = sweeper ? 8 : 7
  return (
    <div className={styles.sheet}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{sweeper ? 'Sweeper' : 'Squad'} check-in</h1>
          <p className={styles.sub}>
            {tournamentName} · {formatSessionDate(date)} · {orderText[order]}
          </p>
        </div>
        <p className={styles.meta}>
          {count} {count === 1 ? 'bowler' : 'bowlers'}
          <br />
          Printed {printedOn}
        </p>
      </header>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.tick}>In</th>
            <th>Lane</th>
            <th>Bowler</th>
            <th>Division</th>
            <th className={styles.num}>Avg</th>
            <th className={styles.num}>{sweeper ? 'Pins' : 'Hdcp'}</th>
            {sweeper && <th>Super</th>}
            <th className={styles.notes}>Notes</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.key}>
            {group.heading !== undefined && (
              <tr className={styles.group}>
                <th colSpan={columns} scope="colgroup">
                  {group.heading}
                </th>
              </tr>
            )}
            {group.rows.map((row) => (
              <tr key={row.registrationId}>
                <td className={styles.tick}>
                  <span className={styles.box} />
                </td>
                <td className={styles.lane}>{row.lane}</td>
                <td>{row.name}</td>
                <td>{row.divisionName}</td>
                <td className={styles.num}>{row.average ?? '—'}</td>
                <td className={styles.num}>{row.pins}</td>
                {sweeper && <td>{row.superSweeper ? 'Yes' : 'No'}</td>}
                <td />
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

/** The sheet to print, in a portal on `document.body`. Hidden on screen. */
export function CheckInPrintCopy(props: Readonly<CheckInSheetProps>) {
  return createPortal(
    <div className={styles.root} data-checkin-print-copy="">
      <CheckInSheet {...props} />
    </div>,
    document.body,
  )
}
