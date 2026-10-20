import { useTournaments } from './useTournaments'

export function TournamentList() {
  const { data, isPending, error, refetch } = useTournaments()

  if (isPending) return <output>Loading tournaments…</output>
  if (error) {
    return (
      <div role="alert">
        <p>{error.message}</p>
        <button type="button" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    )
  }
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
