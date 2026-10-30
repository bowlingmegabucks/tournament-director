/*
 * Below 40rem the CSS turns each row into a block so the table never scrolls sideways (D-73). A
 * `display` change can drop a table's meaning for a screen reader, so every part keeps its role
 * on purpose. That is why the two role rules are off in this file (a `td` counts as interactive
 * for a grid, but here it is a plain cell).
 */
/* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */
import styles from './ScoreTable.module.css'
import type { ScoreBowler } from './types'

interface ScoreTableProps {
  bowlers: ScoreBowler[]
  /** How many game columns to draw (D-69). */
  games: number
  /** Names the table for a screen reader, such as "Scores for lanes 1-2". */
  label: string
}

/** A score cell: the number, "0" for a stored 0, or a blank a screen reader reads as "no score" (D-69). */
function ScoreCell({ score, label }: Readonly<{ score: number | null; label: string }>) {
  return (
    <td role="cell" data-label={label} className={styles.num}>
      {score === null ? <span className={styles.hidden}>no score</span> : score}
    </td>
  )
}

// Stryker disable next-line StringLiteral: class names only style the cell; jsdom does not compute styles.
const totalClass = `${styles.num} ${styles.total}`

/**
 * The bowlers of one lane pair, or of "Other positions": lane, bowler with division, a column per
 * game, and the scratch total (SCR-13, D-68, D-69). Read only.
 */
export function ScoreTable({ bowlers, games, label }: Readonly<ScoreTableProps>) {
  const columns = Array.from({ length: games }, (_, index) => index + 1)
  return (
    <table role="table" className={styles.table} aria-label={label}>
      <thead role="rowgroup" className={styles.head}>
        <tr role="row">
          <th role="columnheader" scope="col">
            Lane
          </th>
          <th role="columnheader" scope="col">
            Bowler
          </th>
          {columns.map((game) => (
            <th key={game} role="columnheader" scope="col" className={styles.num}>
              <span aria-hidden="true">G{game}</span>
              <span className={styles.hidden}>Game {game}</span>
            </th>
          ))}
          <th role="columnheader" scope="col" className={styles.num}>
            Total
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {bowlers.map((bowler) => (
          <tr key={bowler.registrationId} role="row">
            <td role="cell" className={styles.lane}>
              {bowler.position}
            </td>
            <th role="rowheader" scope="row" className={styles.who}>
              <span>{bowler.name}</span>
              <span className={styles.division}>{bowler.divisionName}</span>
            </th>
            {columns.map((game) => (
              <ScoreCell key={game} score={bowler.scores[game - 1] ?? null} label={`G${game}`} />
            ))}
            <td role="cell" data-label="Total" className={totalClass}>
              {bowler.total}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
