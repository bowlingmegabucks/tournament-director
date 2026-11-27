import { useId } from 'react'
import {
  formatGamesOf,
  formatSummary,
  formatThroughNote,
  formatTie,
  gameColumnCount,
  pendingGame,
  squadItems,
} from './format'
import {
  GameCells,
  GameHeaders,
  PlusMinusCell,
  PlusMinusHeader,
  TotalCells,
  TotalHeaders,
} from './ScoreColumns'
import { PayoutTag } from './PayoutTag'
import styles from './ResultsTable.module.css'
import { UnverifiedChip } from './UnverifiedChip'
import type { DivisionResult, SquadRow } from './types'

function TieMarks({ row }: Readonly<{ row: SquadRow }>) {
  return row.ties.map((tie) => (
    <span key={tie.line} className={styles.mark}>
      {formatTie(tie)}
    </span>
  ))
}

/**
 * The counts line over a division's table. The TV page pins it with the heading (D-254), so it is a
 * part of its own.
 */
export function DivisionCounts({ division }: Readonly<{ division: DivisionResult }>) {
  return <p className={styles.sub}>{formatSummary(division)}</p>
}

/**
 * The games a division is ranked through (RES-46), or nothing. The Results tab always draws it; the
 * TV page only while the session is in progress (RES-64).
 */
export function DivisionThroughNote({ division }: Readonly<{ division: DivisionResult }>) {
  const pending = pendingGame(
    division.rows.map((row) => row.scores),
    division.throughGame,
  )
  const note = formatThroughNote(division.throughGame, pending)
  return note ? <p className={styles.sub}>{note}</p> : null
}

/**
 * The summary, tables, and sections of one division (RES-10, RES-11, RES-11a, D-75, D-81): a table
 * with the cut and cash lines, the tie marks, and the earlier-advancer tag; then the bowlers who did
 * not finish and the no-shows. The total against 200 a game sits after the name, then one cell for
 * each game. Scratch Total, Total HDCP, and HDCP Total show only when the API says someone has a
 * handicap. Below 64rem on screen each row is a block. The screen and the print copy both draw it.
 */
export function DivisionBody({
  division,
  games,
  summary = true,
  onNoShow,
}: Readonly<{
  division: DivisionResult
  games: number
  /** Draw the summary lines (the default). The TV page draws them in its pinned heading instead. */
  summary?: boolean
  /** An admin on a completed squad: each no-show gets a "Move or refund" button (NSH-01). */
  onNoShow?: (row: DivisionResult['noShows'][number]) => void
}>) {
  const items = squadItems(division.rows)
  const count = gameColumnCount(games, [
    ...division.rows.map((row) => row.scores),
    ...division.didNotFinish.map((row) => row.scores),
  ])
  const columns = 3 + count + (division.showHandicap ? 3 : 1)
  const anyEarlier = division.rows.some((row) => row.advancedEarlier)
  const pending = pendingGame(
    division.rows.map((row) => row.scores),
    division.throughGame,
  )

  return (
    <>
      {summary && (
        <>
          <DivisionCounts division={division} />
          <DivisionThroughNote division={division} />
        </>
      )}

      {division.rows.length === 0 ? (
        <p>No bowler in this division has finished the squad.</p>
      ) : (
        <table className={`${styles.table} ${styles.games}`}>
          <caption className={styles.hidden}>Results for the {division.name} division</caption>
          <thead className={styles.head}>
            <tr>
              <th scope="col">Place</th>
              <th scope="col">Name</th>
              <PlusMinusHeader />
              <GameHeaders count={count} />
              <TotalHeaders handicap={division.showHandicap} />
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
                    <UnverifiedChip show={item.row.unverified} />
                    {item.row.dnf && <span className={styles.tag}>DNF</span>}
                    {item.row.byRuling && <span className={styles.tag}>Advanced by ruling</span>}
                    {item.row.advancedEarlier && (
                      <span className={styles.tag}>Advanced earlier</span>
                    )}
                    <TieMarks row={item.row} />
                    <PayoutTag amount={item.row.payout} />
                  </th>
                  <PlusMinusCell total={item.row.total} games={item.row.games} />
                  <GameCells
                    scores={item.row.scores}
                    count={count}
                    counted={division.throughGame}
                  />
                  <TotalCells
                    scores={item.row.scores}
                    total={item.row.total}
                    handicap={division.showHandicap}
                    counted={division.throughGame}
                  />
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      {pending && (
        <p className={styles.sub}>
          † Game {pending.game} is not complete yet. These scores show, but places and totals do not
          count them until every bowler in the division has a game {pending.game} score.
        </p>
      )}

      {anyEarlier && (
        <p className={styles.sub}>
          Advanced earlier: this bowler advanced from an earlier squad and cannot advance again. The
          score is at or above the cut line, so the bowler cashes.
        </p>
      )}

      {division.didNotFinish.length > 0 && (
        <>
          <h3>Did not finish</h3>
          <p className={styles.sub}>
            Bowled fewer games than the squad. Not placed. Still one entry.
          </p>
          <table className={`${styles.table} ${styles.games}`}>
            <caption className={styles.hidden}>{division.name} division, did not finish</caption>
            <thead className={styles.head}>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" className={styles.num}>
                  Games
                </th>
                <GameHeaders count={count} />
                <TotalHeaders handicap={division.showHandicap} />
              </tr>
            </thead>
            <tbody>
              {division.didNotFinish.map((row) => (
                <tr key={row.registrationId}>
                  <th scope="row" className={styles.who}>
                    {row.name}
                    <UnverifiedChip show={row.unverified} />
                  </th>
                  <td className={styles.num} data-label="Games">
                    {formatGamesOf(row.games, games)}
                  </td>
                  <GameCells scores={row.scores} count={count} />
                  <TotalCells
                    scores={row.scores}
                    total={row.total}
                    handicap={division.showHandicap}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {division.noShows.length > 0 && (
        <>
          <h3>No show</h3>
          <p className={styles.sub}>Paid an entry and did not bowl. Not placed. Still one entry.</p>
          <ul>
            {division.noShows.map((row) => (
              <li key={row.registrationId}>
                {row.name}
                {onNoShow && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className={styles.action}
                      aria-label={`Move or refund ${row.name}`}
                      onClick={() => {
                        onNoShow(row)
                      }}
                    >
                      Move or refund
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/** One division of a squad on screen: its name, then everything in `DivisionBody`. */
export function DivisionResults({
  division,
  games,
  onNoShow,
}: Readonly<{
  division: DivisionResult
  games: number
  onNoShow?: (row: DivisionResult['noShows'][number]) => void
}>) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{division.name}</h2>
      <DivisionBody division={division} games={games} onNoShow={onNoShow} />
    </section>
  )
}
