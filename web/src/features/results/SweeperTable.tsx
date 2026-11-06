import { formatTie, gameColumnCount, sweeperItems } from './format'
import styles from './ResultsTable.module.css'
import {
  GameCells,
  GameHeaders,
  PlusMinusCell,
  PlusMinusHeader,
  TotalCells,
  TotalHeaders,
} from './ScoreColumns'
import type { SweeperResults, SweeperRow } from './types'

function formatBonus(row: SweeperRow): string {
  return row.bonusPins > 0 ? `${row.divisionName}, +${row.bonusPins} a game` : row.divisionName
}

/**
 * The one list of a sweeper (RES-22, RES-25a, D-82): place, name with the division under it, the
 * total against 200 a game, one cell for each game, and the totals (Scratch Total, Total HDCP, and
 * HDCP Total when a division has bonus pins; one Total when not), with a "Cash Line" after the last
 * casher. `games` is the games of the sweeper.
 */
export function SweeperTable({
  rows,
  games,
}: Readonly<{ rows: SweeperResults['rows']; games: number }>) {
  const items = sweeperItems(rows)
  const count = gameColumnCount(
    games,
    rows.map((row) => row.scores),
  )
  const handicap = rows.some((row) => row.bonusPins > 0)
  return (
    <table className={`${styles.table} ${styles.games}`}>
      <caption className={styles.hidden}>Sweeper results</caption>
      <thead className={styles.head}>
        <tr>
          <th scope="col">Place</th>
          <th scope="col">Name</th>
          <PlusMinusHeader />
          <GameHeaders count={count} />
          <TotalHeaders handicap={handicap} />
        </tr>
      </thead>
      <tbody>
        {items.map((item) =>
          item.kind === 'line' ? (
            <tr key={item.label} className={styles.line}>
              <td colSpan={3 + count + (handicap ? 3 : 1)}>{item.label}</td>
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
              <PlusMinusCell total={item.row.total} games={item.row.games} />
              <GameCells scores={item.row.scores} count={count} />
              <TotalCells scores={item.row.scores} total={item.row.total} handicap={handicap} />
            </tr>
          ),
        )}
      </tbody>
    </table>
  )
}
