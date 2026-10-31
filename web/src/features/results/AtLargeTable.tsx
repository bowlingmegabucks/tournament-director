import { formatSquadStamp } from '../../shared/sessionFormat'
import { formatAtLargeSummary, formatTie } from './format'
import styles from './ResultsTable.module.css'
import type { AtLargeDivision } from './types'

/**
 * The summary and table of one division's at-large advancers (RES-12 to RES-17, D-92): place, the
 * squad of the best entry, name, total, high game, and a mark for a bowler who already cashed on a
 * squad (D-07). A division with no open spots says so. Below 40rem each row is a block. The screen
 * and the print copy both draw it.
 */
export function AtLargeBody({
  division,
  finalsRatio,
}: Readonly<{ division: AtLargeDivision; finalsRatio: number }>) {
  return (
    <>
      <p className={styles.sub}>{formatAtLargeSummary(division, finalsRatio)}</p>
      {division.rows.length === 0 ? (
        <p>
          {division.atLargeSpots === 0
            ? 'No at-large spots in this division.'
            : 'No one has qualified for an at-large spot yet.'}
        </p>
      ) : (
        <table className={styles.table}>
          <caption className={styles.hidden}>
            At-large results for the {division.name} division
          </caption>
          <thead className={styles.head}>
            <tr>
              <th scope="col">Place</th>
              <th scope="col">Squad</th>
              <th scope="col">Name</th>
              <th scope="col" className={styles.num}>
                Total
              </th>
              <th scope="col" className={styles.num}>
                HG
              </th>
              <th scope="col">Casher</th>
            </tr>
          </thead>
          <tbody>
            {division.rows.map((row) => (
              <tr key={row.registrationId}>
                <td className={styles.place}>{row.place}</td>
                <td className={styles.text} data-label="Squad">
                  {formatSquadStamp(row.squadDate)}
                </td>
                <th scope="row" className={styles.who}>
                  {row.name}
                  {row.ties.map((tie) => (
                    <span key={tie.line} className={styles.mark}>
                      {formatTie(tie, 'last at-large spot')}
                    </span>
                  ))}
                </th>
                <td className={styles.totalCell} data-label="Total">
                  {row.total}
                </td>
                <td className={styles.num} data-label="HG">
                  {row.highGame}
                </td>
                <td className={styles.text}>
                  {row.previousCasher && (
                    <>
                      <span className={styles.cash} aria-hidden="true">
                        $
                      </span>{' '}
                      Cashed on a squad
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
