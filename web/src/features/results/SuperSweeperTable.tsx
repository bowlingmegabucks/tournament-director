import {
  formatFlagNote,
  formatFlagTag,
  formatSweeperColumn,
  formatSweeperTotal,
  formatTie,
  sweeperItems,
} from './format'
import styles from './ResultsTable.module.css'
import type { SuperSweeperResults } from './types'

/**
 * The one list of the super sweeper (RES-29a, D-90): place, name with the division and any tag under
 * it, one column for each sweeper, the total, and the high game, with a "Cash Line" after the last
 * casher. A dash is a sweeper still open with no score for the bowler. Below 40rem each row is a
 * block, with the sweeper date above each figure. The screen and the print copy both draw it.
 */
export function SuperSweeperTable({ results }: Readonly<{ results: SuperSweeperResults }>) {
  const items = sweeperItems(results.rows)
  const columns = 4 + results.sweepers.length
  return (
    <table className={styles.table}>
      <caption className={styles.hidden}>Super sweeper results</caption>
      <thead className={styles.head}>
        <tr>
          <th scope="col">Place</th>
          <th scope="col">Name</th>
          {results.sweepers.map((sweeper) => (
            <th key={sweeper.id} scope="col" className={styles.num}>
              {formatSweeperColumn(sweeper)}
            </th>
          ))}
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
              <td colSpan={columns}>{item.label}</td>
            </tr>
          ) : (
            <tr key={item.row.registrationId}>
              <td className={styles.place}>{item.row.place}</td>
              <th scope="row" className={styles.who}>
                {item.row.name}
                {item.row.flags.map((flag) => (
                  <span key={flag.sweeperId} className={styles.tag}>
                    {formatFlagTag(flag)}
                  </span>
                ))}
                <span className={styles.sub}>{item.row.divisionName}</span>
                {item.row.flags.map((flag) => (
                  <span key={flag.sweeperId} className={styles.mark}>
                    {formatFlagNote(flag, results.sweepers)}
                  </span>
                ))}
                {item.row.ties.map((tie) => (
                  <span key={tie.line} className={styles.mark}>
                    {formatTie(tie)}
                  </span>
                ))}
              </th>
              {results.sweepers.map((sweeper, index) => {
                const total = item.row.sweeperTotals[index] ?? null
                return (
                  <td
                    key={sweeper.id}
                    className={styles.num}
                    data-label={formatSweeperColumn(sweeper)}
                  >
                    {total === null && <span className={styles.hidden}>Not bowled yet</span>}
                    <span aria-hidden={total === null ? 'true' : undefined}>
                      {formatSweeperTotal(total)}
                    </span>
                  </td>
                )
              })}
              <td className={styles.totalCell} data-label="Total">
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
