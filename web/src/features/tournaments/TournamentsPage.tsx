import { Link, useLocation, useNavigate } from 'react-router'
import { Can } from '../auth/Can'
import { field } from '../../shared/field'
import { Loading } from '../../shared/Loading'
import { Page } from '../../shared/Page'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { todayLocal } from '../../shared/today'
import { groupTournaments } from './groupTournaments'
import styles from './TournamentsPage.module.css'
import { TournamentList } from './TournamentList'
import { useTournaments } from './useTournaments'

const TOAST_MS = 5000

/** All tournaments, current and upcoming first, then past (TRN-11, TRN-13). */
export function TournamentsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  // The delete dialog sets one of these as it moves here (TRN-37, D-136). Clearing the state keeps
  // a reload quiet.
  const deleted = field(location.state, 'deleted') === true
  const alreadyDeleted = field(location.state, 'alreadyDeleted') === true
  const clear = () => {
    // Stryker disable next-line StringLiteral,ObjectLiteral,BooleanLiteral: any navigation without state clears the toast; only the history entry (replace) and the path spelling differ, which tests cannot see.
    void navigate('.', { replace: true, state: null })
  }

  return (
    <Page>
      <title>Tournaments · Tournament Director</title>
      <div className={styles.titlebar}>
        <h1>Tournaments</h1>
        <Can permission="tournaments.write">
          <Link className={styles.newButton} to="/tournaments/new">
            New tournament
          </Link>
        </Can>
      </div>
      <TournamentGroups />
      {deleted && (
        <Toast kind="success" autoDismissMs={TOAST_MS} onDismiss={clear}>
          Tournament deleted
        </Toast>
      )}
      {alreadyDeleted && (
        <Toast kind="info" autoDismissMs={TOAST_MS} onDismiss={clear}>
          That tournament was already deleted.
        </Toast>
      )}
    </Page>
  )
}

function TournamentGroups() {
  const { data, isPending, error, refetch } = useTournaments()

  if (isPending) return <Loading label="Loading tournaments…" rows={3} />
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
