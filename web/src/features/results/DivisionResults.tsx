import { useId } from 'react'
import { formatGamesOf, formatSummary, formatTie, squadItems } from './format'
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
 * One division of a squad (RES-10, RES-11, RES-11a, D-75, D-76, D-81): a table with the cut and
 * cash lines, the tie marks, and the earlier-advancer tag; then the bowlers who did not finish and
 * the no-shows. HDCP and Games show only when the API says to. Below 40rem each row is a block.
 */
export function DivisionResults({
  division,
  games,
}: Readonly<{ division: DivisionResult; games: number }>) {
  const headingId = useId()
  const items = squadItems(division.rows)
  const columns = 4 + (division.showGames ? 1 : 0) + (division.showHandicap ? 1 : 0)
  const anyEarlier = division.rows.some((row) => row.advancedEarlier)

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{division.name}</h2>
      <p className={styles.sub}>{formatSummary(division)}</p>

      {division.rows.length === 0 ? (
        <p>No bowler in this division has finished the squad.</p>
      ) : (
        <table className={styles.table}>
          <caption className={styles.hidden}>Results for the {division.name} division</caption>
          <thead className={styles.head}>
            <tr>
              <th scope="col">Place</th>
              <th scope="col">Name</th>
              {division.showGames && (
                <th scope="col" className={styles.num}>
                  Games
                </th>
              )}
              <th scope="col" className={styles.num}>
                Total
              </th>
              <th scope="col" className={styles.num}>
                HG
              </th>
              {division.showHandicap && (
                <th scope="col" className={styles.num}>
                  HDCP
                </th>
              )}
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
                  {division.showGames && (
                    <td className={`${styles.num}`} data-label="Games">
                      {item.row.games}
                    </td>
                  )}
                  <td className={`${styles.num} ${styles.total}`} data-label="Total">
                    {item.row.total}
                  </td>
                  <td className={styles.num} data-label="HG">
                    {item.row.highGame}
                  </td>
                  {division.showHandicap && (
                    <td className={styles.num} data-label="HDCP">
                      {item.row.handicap}
                    </td>
                  )}
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
          <table className={styles.table}>
            <caption className={styles.hidden}>{division.name} division, did not finish</caption>
            <thead className={styles.head}>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" className={styles.num}>
                  Games
                </th>
                <th scope="col" className={styles.num}>
                  Total
                </th>
                <th scope="col" className={styles.num}>
                  HG
                </th>
                {division.showHandicap && (
                  <th scope="col" className={styles.num}>
                    HDCP
                  </th>
                )}
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
                  <td className={`${styles.num} ${styles.total}`} data-label="Total">
                    {row.total}
                  </td>
                  <td className={styles.num} data-label="HG">
                    {row.highGame}
                  </td>
                  {division.showHandicap && (
                    <td className={styles.num} data-label="HDCP">
                      {row.handicap}
                    </td>
                  )}
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
    </section>
  )
}
