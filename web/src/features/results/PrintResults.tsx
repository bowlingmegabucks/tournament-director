import { createPortal } from 'react-dom'
import sponsors from '../../assets/score-sheet-sponsors.png'
import { formatSheetDate, formatSheetTime } from '../../shared/sessionFormat'
import { DivisionBody } from './DivisionResults'
import styles from './PrintResults.module.css'
import tableStyles from './ResultsTable.module.css'
import { SweeperTable } from './SweeperTable'
import type { SquadResults, SweeperResults } from './types'

/** RPT-01: the title, the date, the division if there is one, and the sponsor image. */
function PrintHeader({
  title,
  date,
  division,
}: Readonly<{ title: string; date: string; division?: string }>) {
  return (
    <header className={styles.head}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        <p>
          Date: {formatSheetDate(date)} - {formatSheetTime(date)}
        </p>
        {division !== undefined && <p>Division: {division}</p>}
      </div>
      <img
        className={styles.sponsors}
        src={sponsors}
        alt="Northeast MegaBuck$ Tournament and sponsors"
      />
    </header>
  )
}

/**
 * The results to print, in a portal on `document.body` (D-78). A squad prints one division on each
 * page; a sweeper prints its one list. Hidden on screen. It reuses the screen tables.
 */
export function PrintResults({ results }: Readonly<{ results: SquadResults | SweeperResults }>) {
  const { session } = results
  return createPortal(
    <div className={styles.root} data-results-print-copy="">
      {'divisions' in results ? (
        results.divisions.map((division) => (
          <section
            key={division.id}
            className={styles.sheet}
            aria-label={`${division.name} division`}
          >
            <PrintHeader title="Squad Results" date={session.date} division={division.name} />
            <DivisionBody division={division} games={session.games} />
          </section>
        ))
      ) : (
        <section className={styles.sheet} aria-label="Sweeper results">
          <PrintHeader title="Sweeper Results" date={session.date} />
          <p className={tableStyles.sub}>
            {results.entries === 1 ? '1 entry' : `${results.entries} entries`} · Cashing{' '}
            {results.cashers} · Cut score {results.cutScore}
          </p>
          <SweeperTable rows={results.rows} />
        </section>
      )}
    </div>,
    document.body,
  )
}
