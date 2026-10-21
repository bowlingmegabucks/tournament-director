import { Page } from '../../shared/Page'
import { QueryError } from '../../shared/QueryError'
import { todayLocal } from '../../shared/today'
import { groupTournaments } from './groupTournaments'
import { TournamentList } from './TournamentList'
import { useTournaments } from './useTournaments'

/** All tournaments, current and upcoming first, then past (TRN-11, TRN-13). */
export function TournamentsPage() {
  return (
    <Page>
      <title>Tournaments · Tournament Director</title>
      <h1>Tournaments</h1>
      <TournamentGroups />
    </Page>
  )
}

function TournamentGroups() {
  const { data, isPending, error, refetch } = useTournaments()

  if (isPending) return <output>Loading tournaments…</output>
  if (error) {
    return (
      <QueryError
        error={error}
        onRetry={() => {
          void refetch()
        }}
      />
    )
  }
  if (data.length === 0) return <p>No tournaments yet.</p>

  const today = todayLocal()
  const { current, past } = groupTournaments(data, today)
  return (
    <>
      <h2>Current and upcoming</h2>
      {current.length === 0 ? (
        <p>None right now.</p>
      ) : (
        <TournamentList tournaments={current} today={today} />
      )}
      {past.length > 0 && (
        <>
          <h2>Past</h2>
          <TournamentList tournaments={past} today={today} />
        </>
      )}
    </>
  )
}
