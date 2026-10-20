import { useTournaments } from './useTournaments'

export function TournamentList() {
  const { data, isPending, error } = useTournaments()

  if (isPending) return <p>Loading tournaments…</p>
  if (error) return <p role="alert">{error.message}</p>
  if (data.length === 0) return <p>No tournaments yet.</p>

  return (
    <ul>
      {data.map((tournament) => (
        <li key={tournament.id}>
          <strong>{tournament.name}</strong> – {tournament.date} ({tournament.entrants} entrants)
        </li>
      ))}
    </ul>
  )
}
