import { TournamentSummary } from './TournamentSummary'
import styles from './TournamentList.module.css'
import type { Tournament } from './types'

/** Cards for the tournaments it is given. Each group on the page passes its own. */
export function TournamentList({
  tournaments,
  today,
}: Readonly<{ tournaments: Tournament[]; today: string }>) {
  return (
    <ul className={styles.list}>
      {tournaments.map((tournament) => (
        <li key={tournament.id}>
          <TournamentSummary tournament={tournament} today={today} as="h3" />
        </li>
      ))}
    </ul>
  )
}
