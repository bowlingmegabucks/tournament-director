import { useId } from 'react'
import { formatGamesOf, formatSummary, formatTie, gameColumnCount, squadItems } from './format'
import {
  GameCells,
  GameHeaders,
  PlusMinusCell,
  PlusMinusHeader,
  TotalCells,
  TotalHeaders,
} from './ScoreColumns'
import styles from './ResultsTable.module.css'
import type { DivisionResult, SquadRow } from './types'

function TieMarks({ row }: Readonly<{ row: SquadRow }>) {
  return row.ties.map((tie) => (
    <span key={tie.line} className={styles.mark}>
      {formatTie(tie)}
    </span>
  ))
}

/**
 * The summary, tables, and sections of one division (RES-10, RES-11, RES-11a, D-75, D-76, D-81): a
 * table with the cut and cash lines, the tie marks, and the earlier-advancer tag; then the bowlers
 * who did not finish and the no-shows. The total against 200 a game sits after the name, then one cell for each game; Scratch Total, Total HDCP, and HDCP Total show only when the API says someone has a handicap. Below 40rem
 * each row is a block. The screen and the print copy both draw it.
 */
export function DivisionBody({
  division,
  games,
}: Readonly<{ division: DivisionResult; games: number }>) {
  const items = squadItems(division.rows)
  const count = gameColumnCount(games, [
    ...division.rows.map((row) => row.scores),
    ...division.didNotFinish.map((row) => row.scores),
  ])
  const columns = 3 + count + (division.showHandicap ? 3 : 1)
  const anyEarlier = division.rows.some((row) => row.advancedEarlier)

  return (
    <>
      <p className={styles.sub}>{formatSummary(division)}</p>

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
                    {item.row.advancedEarlier && (
                      <span className={styles.tag}>Advanced earlier</span>
                    )}
                    <TieMarks row={item.row} />
                  </th>
                  <PlusMinusCell total={item.row.total} games={item.row.scores.length} />
                  <GameCells scores={item.row.scores} count={count} />
                  <TotalCells
                    scores={item.row.scores}
                    total={item.row.total}
                    handicap={division.showHandicap}
                  />
                </tr>
              ),
            )}
          </tbody>
        </table>
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
              <li key={row.registrationId}>{row.name}</li>
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
}: Readonly<{ division: DivisionResult; games: number }>) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{division.name}</h2>
      <DivisionBody division={division} games={games} />
    </section>
  )
}
