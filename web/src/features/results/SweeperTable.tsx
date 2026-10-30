import { formatTie, sweeperItems } from './format'
import styles from './ResultsTable.module.css'
import type { SweeperResults, SweeperRow } from './types'

function formatBonus(row: SweeperRow): string {
  return row.bonusPins > 0 ? `${row.divisionName}, +${row.bonusPins} a game` : row.divisionName
}

/**
 * The one list of a sweeper (RES-22, RES-25a, D-82): place, name with the division under it,
 * total with the bonus pins, and high game, with a "Cash Line" after the last casher.
 */
export function SweeperTable({ rows }: Readonly<{ rows: SweeperResults['rows'] }>) {
  const items = sweeperItems(rows)
  return (
    <table className={styles.table}>
      <caption className={styles.hidden}>Sweeper results</caption>
      <thead className={styles.head}>
        <tr>
          <th scope="col">Place</th>
          <th scope="col">Name</th>
          <th scope="col" className={styles.num}>
            Total
          </th>
          <th scope="col" className={styles.num}>
            HG
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) =>
          item.kind === 'line' ? (
            <tr key={item.label} className={styles.line}>
              <td colSpan={4}>{item.label}</td>
            </tr>
          ) : (
            <tr key={item.row.registrationId}>
              <td className={styles.place}>{item.row.place}</td>
              <th scope="row" className={styles.who}>
                {item.row.name}
                <span className={styles.sub}>{formatBonus(item.row)}</span>
                {item.row.ties.map((tie) => (
                  <span key={tie.line} className={styles.mark}>
                    {formatTie(tie)}
                  </span>
                ))}
              </th>
              <td className={`${styles.num} ${styles.total}`} data-label="Total">
                {item.row.total}
              </td>
              <td className={styles.num} data-label="HG">
                {item.row.highGame}
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  )
}
