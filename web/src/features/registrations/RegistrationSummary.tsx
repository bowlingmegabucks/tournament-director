import { useId } from 'react'
import { formatSessionDate } from '../../shared/sessionFormat'
import styles from './RegistrationsPage.module.css'
import type { Summary } from './types'

function Breakdown({
  title,
  rows,
}: Readonly<{ title: string; rows: { key: string; label: string; entries: number }[] }>) {
  const titleId = useId()
  return (
    <section className={styles.breakdown} aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.key}>
            <span>{row.label}</span>
            <span>{row.entries}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Entry counts for the whole tournament, not the filtered rows (REG-24, D-50). A division counts
 * the squads its bowlers entered; sweepers do not count toward it.
 */
export function RegistrationSummary({ summary }: Readonly<{ summary: Summary }>) {
  const titleId = useId()
  return (
    <section className={styles.summary} aria-labelledby={titleId}>
      <h2 id={titleId}>Entries in this tournament</h2>
      <dl className={styles.totals}>
        <div>
          <dt>Bowlers registered</dt>
          <dd>{summary.registrations}</dd>
        </div>
        <div>
          <dt>Super sweeper</dt>
          <dd>{summary.superSweepers}</dd>
        </div>
      </dl>
      <div className={styles.breakdowns}>
        <Breakdown
          title="By division"
          rows={summary.divisions.map(({ id, number, name, entries }) => ({
            key: id,
            label: `${number} ${name}`,
            entries,
          }))}
        />
        <Breakdown
          title="By squad"
          rows={summary.squads.map(({ id, date, entries }) => ({
            key: id,
            label: formatSessionDate(date),
            entries,
          }))}
        />
        <Breakdown
          title="By sweeper"
          rows={summary.sweepers.map(({ id, date, entries }) => ({
            key: id,
            label: formatSessionDate(date),
            entries,
          }))}
        />
      </div>
      <p className={styles.note}>
        Entries per division count squads, not sweepers. Counts cover the whole tournament, not the
        filtered rows.
      </p>
    </section>
  )
}
