import { Link } from 'react-router'
import { Loading } from '../../shared/Loading'
import { Page } from '../../shared/Page'
import { QueryError } from '../../shared/QueryError'
import { todayLocal } from '../../shared/today'
import { currentTournament } from '../tournaments/groupTournaments'
import { TournamentSummary } from '../tournaments/TournamentSummary'
import { useTournaments } from '../tournaments/useTournaments'

/** The start page: the current or next tournament, and a way to the rest (TRN-14). */
export function HomePage() {
  return (
    <Page>
      <title>Tournament Director</title>
      <h1>Tournament Management</h1>
      <CurrentTournament />
    </Page>
  )
}

function CurrentTournament() {
  const { data, isPending, error, refetch } = useTournaments()

  if (isPending) return <Loading label="Loading tournaments…" />
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
  const current = currentTournament(data, today)
  return (
    <>
      {current ? (
        <TournamentSummary tournament={current} today={today} as="h2" />
      ) : (
        <p>No tournament is current or upcoming.</p>
      )}
      <p>
        <Link to="/tournaments">All tournaments</Link>
      </p>
    </>
  )
}
