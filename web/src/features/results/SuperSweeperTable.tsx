import {
  formatFlagNote,
  formatFlagTag,
  formatSweeperColumn,
  formatPlusMinus,
  formatTie,
  gameColumnCount,
  plural,
  sweeperItems,
} from './format'
import styles from './ResultsTable.module.css'
import { GameCells, GameHeaders, PlusMinusHeader, TotalCells, TotalHeaders } from './ScoreColumns'
import type { SuperSweeperResults } from './types'

/**
 * The one list of the super sweeper (RES-29a, D-90). Each bowler takes one line for each sweeper,
 * with the sweeper and its date, one cell for each game, and the totals of that sweeper. Place,
 * name (with the division and any tag), and the total against 200 a game span the lines, as does
 * Cumulative at the right. A dash is a sweeper still open with no score for the bowler, or a game
 * that sweeper does not have. A "Cash Line" follows the last casher. Below 64rem on screen each bowler is one
 * card, with Cumulative last.
 */
export function SuperSweeperTable({ results }: Readonly<{ results: SuperSweeperResults }>) {
  const items = sweeperItems(results.rows)
  const { sweepers } = results
  const count = gameColumnCount(
    Math.max(0, ...sweepers.map((sweeper) => sweeper.games)),
    results.rows.flatMap((row) => row.sweeperScores.map((scores) => scores ?? [])),
  )
  const handicap = results.rows.some((row) => row.sweeperPins.some((pins) => pins > 0))
  const columns = 5 + count + (handicap ? 3 : 1)
  const mixedGames = new Set(sweepers.map((sweeper) => sweeper.games)).size > 1
  // Every bowler has one line for each sweeper, so these spans always match the rows drawn.
  const lines = sweepers.length
  return (
    <table className={`${styles.table} ${styles.games}`}>
      <caption className={styles.hidden}>Super sweeper results</caption>
      <thead className={styles.head}>
        <tr>
          <th scope="col">Place</th>
          <th scope="col">Name</th>
          <PlusMinusHeader />
          <th scope="col">Sweeper</th>
          <GameHeaders count={count} />
          <TotalHeaders handicap={handicap} />
          <th scope="col" className={styles.num}>
            Cumulative
          </th>
        </tr>
      </thead>
      {items.map((item) => {
        if (item.kind === 'line') {
          return (
            <tbody key={item.label}>
              <tr className={styles.line}>
                <td colSpan={columns}>{item.label}</td>
              </tr>
            </tbody>
          )
        }
        const { row } = item
        return (
          <tbody key={row.registrationId} className={styles.bowler}>
            {sweepers.map((sweeper, index) => {
              const scores = row.sweeperScores[index] ?? null
              const sweeperTotal = row.sweeperTotals[index] ?? null
              return (
                <tr key={sweeper.id}>
                  {index === 0 && (
                    <>
                      <td className={`${styles.place} ${styles.middle}`} rowSpan={lines}>
                        {row.place}
                      </td>
                      <th
                        scope="rowgroup"
                        className={`${styles.who} ${styles.middle}`}
                        rowSpan={lines}
                      >
                        {row.name}
                        {row.flags.map((flag) => (
                          <span key={flag.sweeperId} className={styles.tag}>
                            {formatFlagTag(flag)}
                          </span>
                        ))}
                        <span className={styles.sub}>{row.divisionName}</span>
                        {row.flags.map((flag) => (
                          <span key={flag.sweeperId} className={styles.mark}>
                            {formatFlagNote(flag, sweepers)}
                          </span>
                        ))}
                        {row.ties.map((tie) => (
                          <span key={tie.line} className={styles.mark}>
                            {formatTie(tie)}
                          </span>
                        ))}
                      </th>
                      <td className={`${styles.plusMinus} ${styles.middle}`} rowSpan={lines}>
                        {formatPlusMinus(row.total, row.games)}
                      </td>
                    </>
                  )}
                  <th scope="row" className={styles.sweeperName}>
                    {formatSweeperColumn(sweeper)}
                    {mixedGames && (
                      <span className={styles.sub}>{plural(sweeper.games, 'game', 'games')}</span>
                    )}
                  </th>
                  <GameCells scores={scores} count={count} />
                  <TotalCells scores={scores} total={sweeperTotal} handicap={handicap} />
                  {index === 0 && (
                    <td
                      className={`${styles.totalCell} ${styles.middle} ${styles.cumulative}`}
                      rowSpan={lines}
                      data-label="Cumulative"
                    >
                      {row.total}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        )
      })}
    </table>
  )
}
