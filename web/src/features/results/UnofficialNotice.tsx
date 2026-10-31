import styles from './ResultsPage.module.css'

/**
 * RES-36, D-84, D-88: shown above results that are not final, on screen and on paper. A squad or a
 * sweeper says it is not complete; the tournament pages say that not every squad (or sweeper) is.
 * Scores can still change, so the places (or seeds) are not official yet.
 */
export function UnofficialNotice({
  kind,
  outcome = 'places',
}: Readonly<{
  kind: 'squad' | 'sweeper' | 'squads' | 'sweepers'
  /** What can still change besides the scores: the places, or on the seeding page the seeds. */
  outcome?: 'places' | 'seeds'
}>) {
  const one = kind === 'squads' ? 'squad' : 'sweeper'
  const single = kind === 'squad' || kind === 'sweeper'
  const reason = single ? `This ${kind} is not complete` : `Not every ${one} is complete`
  return (
    <output className={styles.unofficial}>
      <strong>Unofficial results.</strong> {reason}, so scores and {outcome} can still change.
    </output>
  )
}
