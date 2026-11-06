import styles from './ResultsTable.module.css'
import { formatPlusMinus, sum } from './format'

/** The header of the +/− column: no text on screen, a name for screen readers. */
export function PlusMinusHeader() {
  return (
    <th scope="col" className={styles.num}>
      <span className={styles.hidden}>Plus or minus 200 a game</span>
    </th>
  )
}

/** G1 to Gn. */
export function GameHeaders({ count }: Readonly<{ count: number }>) {
  return Array.from({ length: count }, (_, index) => (
    <th key={`G${index + 1}`} scope="col" className={styles.num}>
      {`G${index + 1}`}
    </th>
  ))
}

/** Scratch Total, Total HDCP, and HDCP Total when there is a handicap; a single Total when not. */
export function TotalHeaders({
  handicap,
  totalLabel = 'Total',
}: Readonly<{ handicap: boolean; totalLabel?: string }>) {
  return handicap ? (
    <>
      <th scope="col" className={styles.num}>
        Scratch Total
      </th>
      <th scope="col" className={styles.num}>
        Total HDCP
      </th>
      <th scope="col" className={styles.num}>
        {totalLabel === 'Total' ? 'HDCP Total' : totalLabel}
      </th>
    </>
  ) : (
    <th scope="col" className={styles.num}>
      {totalLabel}
    </th>
  )
}

/** The cell of the +/− figure, right after the name. */
export function PlusMinusCell({ total, games }: Readonly<{ total: number; games: number }>) {
  return <td className={styles.plusMinus}>{formatPlusMinus(total, games)}</td>
}

/**
 * The cells of G1 to Gn. A game the bowler has not bowled shows a dash; a screen reader says "No
 * game". `scores` is `null` for a sweeper that is still open with no score yet.
 */
export function GameCells({
  scores,
  count,
}: Readonly<{ scores: readonly (number | null)[] | null; count: number }>) {
  return Array.from({ length: count }, (_, index) => {
    const label = `G${index + 1}`
    const score = scores?.[index] ?? undefined
    if (score !== undefined) {
      return (
        <td key={label} className={styles.num} data-label={label}>
          {score}
        </td>
      )
    }
    // An open sweeper with no score says so once, on the first game; any other gap is "No game".
    let spoken = 'No game'
    if (scores === null) spoken = index === 0 ? 'Not bowled yet' : ''
    return (
      <td key={label} className={`${styles.num} ${styles.empty}`} data-label={label}>
        {spoken && <span className={styles.hidden}>{spoken}</span>}
        <span aria-hidden="true">{'\u2013'}</span>
      </td>
    )
  })
}

/**
 * The totals after the games: scratch, the handicap for every game bowled, and the total with it.
 * `total` already holds the handicap (SCR-08), so the handicap is `total` minus the scratch games.
 * With no handicap there is one Total. `total` is `null` while a sweeper is open with no score.
 */
export function TotalCells({
  scores,
  total,
  handicap,
}: Readonly<{
  scores: readonly (number | null)[] | null
  total: number | null
  handicap: boolean
}>) {
  const scratch = scores === null ? null : sum(scores)
  // A sweeper still open with no score has no total yet: a dash that screen readers skip.
  const figure = (value: number | null) =>
    value === null ? <span aria-hidden="true">{'\u2013'}</span> : value
  if (!handicap) {
    return (
      <td className={styles.totalCell} data-label="Total">
        {figure(total)}
      </td>
    )
  }
  return (
    <>
      <td className={styles.num} data-label="Scratch Total">
        {figure(scratch)}
      </td>
      <td className={styles.num} data-label="Total HDCP">
        {figure(total === null || scratch === null ? null : total - scratch)}
      </td>
      <td className={styles.totalCell} data-label="HDCP Total">
        {figure(total)}
      </td>
    </>
  )
}
