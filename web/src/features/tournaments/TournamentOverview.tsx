import { useOutletContext } from 'react-router'
import { formatDateRange, formatFee } from './format'
import styles from './TournamentOverview.module.css'
import type { Tournament } from './types'

/** What the vendor detail route returns for one tournament (TRN-15, D-24). */
export function TournamentOverview() {
  const tournament = useOutletContext<Tournament>()

  return (
    <>
      <title>{`${tournament.name} · Tournament Director`}</title>
      <h1>{tournament.name}</h1>
      <dl className={styles.fields}>
        <dt>Dates</dt>
        <dd>{formatDateRange(tournament.startDate, tournament.endDate)}</dd>
        <dt>Bowling center</dt>
        <dd>{tournament.bowlingCenter}</dd>
        <dt>Entry fee</dt>
        <dd>{formatFee(tournament.entryFee)}</dd>
      </dl>
    </>
  )
}
