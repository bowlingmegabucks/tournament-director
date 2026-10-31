import styles from './ResultsPage.module.css'

/**
 * RES-36, D-84: shown above the results of a squad or sweeper that is not complete, on screen and
 * on paper. Scores can still change, so the places are not official yet.
 */
export function UnofficialNotice({ kind }: Readonly<{ kind: 'squad' | 'sweeper' }>) {
  return (
    <output className={styles.unofficial}>
      <strong>Unofficial results.</strong> This {kind} is not complete, so scores and places can
      still change.
    </output>
  )
}
