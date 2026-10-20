import styles from './TournamentList.module.css'
import { useTournaments } from './useTournaments'

export function TournamentList() {
  const { data, isPending, error, refetch } = useTournaments()

  if (isPending) return <output>Loading tournaments…</output>
  if (error) {
    return (
      <div role="alert" className={styles.error}>
        <p>{error.message}</p>
        <button type="button" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    )
  }
  if (data.length === 0) return <p>No tournaments yet.</p>

  return (
    <ul className={styles.list}>
      {data.map((tournament) => (
        <li key={tournament.id} className={styles.item}>
          <strong>{tournament.name}</strong>
          <div className={styles.meta}>
            {tournament.date} · {tournament.entrants} entrants
          </div>
        </li>
      ))}
    </ul>
  )
}
