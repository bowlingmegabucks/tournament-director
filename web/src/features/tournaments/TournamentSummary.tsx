import { Link } from 'react-router'
import { formatDateRange, formatFee } from './format'
import { tournamentStatus } from './groupTournaments'
import styles from './TournamentSummary.module.css'
import type { Tournament } from './types'

const badgeText = { 'in-progress': 'In progress', upcoming: 'Upcoming' } as const

// Stryker disable next-line StringLiteral: class names only style the badge.
const badgeClass = (status: keyof typeof badgeText) => `${styles.badge} ${styles[status]}`

interface TournamentSummaryProps {
  tournament: Tournament
  /** `YYYY-MM-DD`, from `todayLocal()`. */
  today: string
  /** The heading level that fits the page; the list uses h3 under its group headings. */
  as: 'h2' | 'h3'
}

/** A card: status badge, name that links to the tournament, dates, center, and fee. */
export function TournamentSummary({
  tournament,
  today,
  as: Heading,
}: Readonly<TournamentSummaryProps>) {
  const status = tournamentStatus(tournament, today)

  return (
    <article className={styles.card}>
      {status !== 'past' && (
        <p className={styles.badgeRow}>
          <span className={badgeClass(status)}>{badgeText[status]}</span>
        </p>
      )}
      <Heading className={styles.name}>
        <Link to={`/tournaments/${tournament.id}`}>{tournament.name}</Link>
      </Heading>
      <p className={styles.meta}>
        {formatDateRange(tournament.startDate, tournament.endDate)} · {tournament.bowlingCenter} ·
        Entry fee {formatFee(tournament.entryFee)}
      </p>
    </article>
  )
}
