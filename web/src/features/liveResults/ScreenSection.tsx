import { useId } from 'react'
import { plural } from '../../shared/plural'
import { DivisionBody } from '../results/DivisionResults'
import { SuperSweeperTable } from '../results/SuperSweeperTable'
import { SweeperTable } from '../results/SweeperTable'
import { formatRatio } from '../../shared/sessionFormat'
import { isUnofficial, screenHeading, screenThrough, type LiveScreen } from './liveLogic'
import styles from './LiveResultsPage.module.css'

/**
 * One screen of the TV page (D-242): a heading with its tags ("Unofficial" while the session is
 * open, "Through game 3" for the games counted), then the table the Results tab draws, at TV size.
 * `highlighted` outlines the table that just changed (D-245).
 */
export function ScreenSection({
  screen,
  highlighted,
}: Readonly<{ screen: LiveScreen; highlighted: boolean }>) {
  const headingId = useId()
  const through = screenThrough(screen)
  return (
    <section
      aria-labelledby={headingId}
      className={highlighted ? `${styles.block} ${styles.updated}` : styles.block}
    >
      <h2 id={headingId} className={styles.heading}>
        {screenHeading(screen)}
        {isUnofficial(screen) && <span className={styles.tag}>Unofficial</span>}
        {through !== null && through > 0 && (
          <span className={styles.tag}>Through game {through}</span>
        )}
      </h2>
      <div className={styles.table}>
        {screen.kind === 'squad' && (
          <DivisionBody division={screen.division} games={screen.results.session.games} />
        )}
        {screen.kind === 'sweeper' && (
          <>
            <p className={styles.sub}>
              {plural(screen.results.entries, 'entry', 'entries')} · Cashing{' '}
              {screen.results.cashers} · Cash ratio {formatRatio(screen.results.cashRatio)}
            </p>
            <SweeperTable
              rows={screen.results.rows}
              games={screen.results.session.games}
              throughGame={screen.results.throughGame}
            />
          </>
        )}
        {screen.kind === 'super-sweeper' && <SuperSweeperTable results={screen.results} />}
      </div>
    </section>
  )
}
