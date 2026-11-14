import { formatThroughNote, formatTie, gameColumnCount, pendingGame, sweeperItems } from './format'
import { PayoutTag } from './PayoutTag'
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
/** The line over a sweeper's table: the games it is ranked through (RES-46). The TV pins it (D-254). */
export function SweeperNote({
  rows,
  throughGame,
}: Readonly<{ rows: SweeperResults['rows']; throughGame: number | null }>) {
  const note = formatThroughNote(
    throughGame,
    pendingGame(
      rows.map((row) => row.scores),
      throughGame,
    ),
  )
  return note ? <p className={styles.sub}>{note}</p> : null
}

export function SweeperTable({
  rows,
  games,
  throughGame = null,
  note = true,
}: Readonly<{
  rows: SweeperResults['rows']
  games: number
  /** The games counted (RES-41); `null` when every game counts. */
  throughGame?: number | null
  /** Draw the line over the table (the default). The TV page draws it in its pinned heading. */
  note?: boolean
}>) {
  const items = sweeperItems(rows)
  const count = gameColumnCount(
    games,
    rows.map((row) => row.scores),
  )
  const handicap = rows.some((row) => row.bonusPins > 0)
  const pending = pendingGame(
    rows.map((row) => row.scores),
    throughGame,
  )
  return (
    <>
      {note && <SweeperNote rows={rows} throughGame={throughGame} />}
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
                  {item.row.dnf && <span className={styles.tag}>DNF</span>}
                  <span className={styles.sub}>{formatBonus(item.row)}</span>
                  {item.row.ties.map((tie) => (
                    <span key={tie.line} className={styles.mark}>
                      {formatTie(tie)}
                    </span>
                  ))}
                  <PayoutTag amount={item.row.payout} />
                </th>
                <PlusMinusCell total={item.row.total} games={item.row.games} />
                <GameCells scores={item.row.scores} count={count} counted={throughGame} />
                <TotalCells
                  scores={item.row.scores}
                  total={item.row.total}
                  handicap={handicap}
                  counted={throughGame}
                />
              </tr>
            ),
          )}
        </tbody>
      </table>
      {pending && (
        <p className={styles.sub}>
          † Game {pending.game} is not complete yet. These scores show, but places and totals do not
          count them until every bowler has a game {pending.game} score.
        </p>
      )}
    </>
  )
}
