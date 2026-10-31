import { createPortal } from 'react-dom'
import { AtLargeBody } from './AtLargeTable'
import { PrintHeader } from './PrintHeader'
import styles from './PrintResults.module.css'
import tableStyles from './ResultsTable.module.css'
import { SeedingBody } from './SeedingTable'
import { SuperSweeperTable } from './SuperSweeperTable'
import type { AtLargeResults, SeedingResults, SuperSweeperResults } from './types'

/** The print copy goes in a portal on `document.body`, hidden on screen (D-78, D-89). */
function PrintRoot({ children }: Readonly<{ children: React.ReactNode }>) {
  return createPortal(
    <div className={styles.root} data-results-print-copy="">
      {children}
    </div>,
    document.body,
  )
}

/**
 * RPT-04c, D-89: the at-large results to print, one division on each letter page, or only the
 * division named. Open squads print "UNOFFICIAL RESULTS" on every page (D-88).
 */
export function PrintAtLarge({
  results,
  only,
}: Readonly<{ results: AtLargeResults; only?: string }>) {
  return (
    <PrintRoot>
      {results.divisions
        .filter((division) => only === undefined || division.id === only)
        .map((division) => (
          <section
            key={division.id}
            className={styles.sheet}
            aria-label={`${division.name} division`}
          >
            <PrintHeader title="At Large" division={division.name} unofficial={!results.complete} />
            <AtLargeBody division={division} finalsRatio={results.finalsRatio} />
          </section>
        ))}
    </PrintRoot>
  )
}

/** RPT-04d, D-89: the finals seeding to print, one division on each letter page, or only the one named. */
export function PrintSeeding({
  results,
  only,
}: Readonly<{ results: SeedingResults; only?: string }>) {
  return (
    <PrintRoot>
      {results.divisions
        .filter((division) => only === undefined || division.id === only)
        .map((division) => (
          <section
            key={division.id}
            className={styles.sheet}
            aria-label={`${division.name} division`}
          >
            <PrintHeader
              title="Finals Seeding"
              division={division.name}
              unofficial={!results.complete}
            />
            <SeedingBody division={division} />
          </section>
        ))}
    </PrintRoot>
  )
}

/** RPT-04b, D-89: the super sweeper results to print, one list. */
export function PrintSuperSweeper({ results }: Readonly<{ results: SuperSweeperResults }>) {
  return (
    <PrintRoot>
      <section className={styles.sheet} aria-label="Super sweeper results">
        <PrintHeader title="Super Sweeper Results" unofficial={!results.complete} />
        <p className={tableStyles.sub}>
          {results.entries === 1 ? '1 entry' : `${results.entries} entries`} · Cashing{' '}
          {results.cashers} · Cut score {results.cutScore}
        </p>
        <SuperSweeperTable results={results} />
      </section>
    </PrintRoot>
  )
}
