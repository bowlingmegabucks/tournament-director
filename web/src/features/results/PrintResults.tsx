import { createPortal } from 'react-dom'
import { DivisionBody } from './DivisionResults'
import { plural } from './format'
import { PrintHeader } from './PrintHeader'
import styles from './PrintResults.module.css'
import tableStyles from './ResultsTable.module.css'
import { SweeperTable } from './SweeperTable'
import type { SquadResults, SweeperResults } from './types'

/**
 * The results to print, in a portal on `document.body` (D-78). A squad prints one division on each
 * page; a sweeper prints its one list. Hidden on screen. It reuses the screen tables.
 */
export function PrintResults({
  results,
  only,
}: Readonly<{ results: SquadResults | SweeperResults; only?: string }>) {
  const { session } = results
  return createPortal(
    <div className={styles.root} data-results-print-copy="">
      {'divisions' in results ? (
        results.divisions
          .filter((division) => only === undefined || division.id === only)
          .map((division) => (
            <section
              key={division.id}
              className={styles.sheet}
              aria-label={`${division.name} division`}
            >
              <PrintHeader
                title="Squad Results"
                date={session.date}
                division={division.name}
                unofficial={!session.complete}
              />
              <DivisionBody division={division} games={session.games} />
            </section>
          ))
      ) : (
        <section className={styles.sheet} aria-label="Sweeper results">
          <PrintHeader title="Sweeper Results" date={session.date} unofficial={!session.complete} />
          <p className={tableStyles.sub}>
            {plural(results.entries, 'entry', 'entries')} · Cashing {results.cashers} · Cut score{' '}
            {results.cutScore}
          </p>
          <SweeperTable rows={results.rows} />
        </section>
      )}
    </div>,
    document.body,
  )
}
