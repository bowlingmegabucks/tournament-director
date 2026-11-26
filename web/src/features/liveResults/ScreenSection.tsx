import { useEffect, useId, useRef } from 'react'
import { plural } from '../../shared/plural'
import { formatRatio } from '../../shared/sessionFormat'
import { DivisionBody, DivisionCounts, DivisionThroughNote } from '../results/DivisionResults'
import { formatAtLarge, formatCashLine, formatLines } from '../results/format'
import { SuperSweeperTable } from '../results/SuperSweeperTable'
import { SweeperNote, SweeperTable } from '../results/SweeperTable'
import type { LiveAtLarge } from '../results/types'
import { screenHeading, screenState, screenThrough, type LiveScreen } from './liveLogic'
import styles from './LiveResultsPage.module.css'

/** The at-large line (RES-58). The bar between its parts is for the eye: a screen reader skips it. */
function AtLargeLine({ figure }: Readonly<{ figure: LiveAtLarge }>) {
  const [score, spots] = formatAtLarge(figure).split(' | ')
  return (
    <p className={styles.lines}>
      {score}
      {spots !== undefined && (
        <>
          {' '}
          <span aria-hidden="true">|</span> {spots}
        </>
      )}
    </p>
  )
}

/**
 * One screen of the TV page (D-242): a heading with its state (RES-64), the counts, and the totals at the cut and cash
 * lines, then the table the Results tab draws, at TV size. The heading block and the table's column
 * heads stay pinned at the top of the screen while the rows scroll, until the next screen pushes
 * them away (D-254), so a row far down still shows its division and where the lines are.
 * An open squad or sweeper has a blue band and bar, with an "In progress" or "Unofficial" badge
 * drawn before the title; an official one has a "✓ Official" tag. The super sweeper only has its tag.
 * A squad screen names its cut and cash lines "Squad:" and puts its division's at-large figure on the line below (RES-58). `highlighted` outlines the table that just changed (D-245).
 */
export function ScreenSection({
  screen,
  highlighted,
  atLarge,
}: Readonly<{ screen: LiveScreen; highlighted: boolean; atLarge?: LiveAtLarge }>) {
  const headingId = useId()
  const state = screenState(screen)
  const inProgress = state === 'in-progress'
  const through = inProgress ? screenThrough(screen) : null
  const superSweeper = screen.kind === 'super-sweeper'
  const open = !superSweeper && state !== 'official'
  const section = useRef<HTMLElement>(null)
  const pinned = useRef<HTMLDivElement>(null)

  // The column heads pin under the heading block, so they need its height. An effect is right
  // here: measuring the DOM is outside React. The height goes to a CSS variable on the section.
  useEffect(() => {
    const block = pinned.current
    const root = section.current
    if (!block || !root) return
    const measure = () => {
      root.style.setProperty('--pinned', `${block.offsetHeight}px`)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(block)
    return () => {
      watch.disconnect()
    }
  }, [])

  const counts = (results: { entries: number; cashers: number; cashRatio: number }) =>
    `${plural(results.entries, 'entry', 'entries')} · Cashing ${results.cashers} · Cash ratio ${formatRatio(results.cashRatio)}`

  return (
    <section
      ref={section}
      aria-labelledby={headingId}
      className={[styles.block, open && styles.open, highlighted && styles.updated]
        .filter(Boolean)
        .join(' ')}
    >
      <div ref={pinned} className={styles.pinned}>
        <h2 id={headingId} className={styles.heading}>
          {screenHeading(screen)}
          {open && (
            <>
              {' '}
              {/* After the title, so a heading list names the screen first; CSS draws it before. */}
              <span className={styles.badge}>
                {inProgress ? (
                  <>
                    <span aria-hidden="true">● </span>In progress
                    {through !== null && through > 0 && ` · Thru game ${through}`}
                  </>
                ) : (
                  'Unofficial'
                )}
              </span>
            </>
          )}
          {state === 'official' && (
            <>
              {' '}
              <span className={styles.tag}>
                {!superSweeper && <span aria-hidden="true">✓ </span>}Official
              </span>
            </>
          )}
          {superSweeper && state !== 'official' && (
            <>
              {' '}
              <span className={styles.tag}>Unofficial</span>
            </>
          )}
        </h2>
        <div className={styles.lead}>
          {screen.kind === 'squad' && (
            <>
              <DivisionCounts division={screen.division} />
              {inProgress && <DivisionThroughNote division={screen.division} />}
              <p className={styles.lines}>Squad: {formatLines(screen.division)}</p>
              {atLarge && <AtLargeLine figure={atLarge} />}
            </>
          )}
          {screen.kind === 'sweeper' && (
            <>
              <p className={styles.sub}>{counts(screen.results)}</p>
              {inProgress && (
                <SweeperNote rows={screen.results.rows} throughGame={screen.results.throughGame} />
              )}
              <p className={styles.lines}>{formatCashLine(screen.results.rows)}</p>
            </>
          )}
          {screen.kind === 'super-sweeper' && (
            <>
              <p className={styles.sub}>{counts(screen.results)}</p>
              <p className={styles.lines}>{formatCashLine(screen.results.rows)}</p>
            </>
          )}
        </div>
      </div>
      <div className={styles.table}>
        {screen.kind === 'squad' && (
          <DivisionBody
            division={screen.division}
            games={screen.results.session.games}
            summary={false}
          />
        )}
        {screen.kind === 'sweeper' && (
          <SweeperTable
            rows={screen.results.rows}
            games={screen.results.session.games}
            throughGame={screen.results.throughGame}
            note={false}
          />
        )}
        {screen.kind === 'super-sweeper' && <SuperSweeperTable results={screen.results} />}
      </div>
    </section>
  )
}
