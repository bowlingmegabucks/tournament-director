import { Link, NavLink, Navigate, Outlet, useOutletContext, useParams } from 'react-router'
import { Can } from '../auth/Can'
import { useMe } from '../auth/useMe'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatSessionDate } from '../../shared/sessionFormat'
import { useSquads } from '../squads/useSquads'
import { useSweepers } from '../sweepers/useSweepers'
import type { Tournament } from '../tournaments/types'
import styles from './SessionPortal.module.css'
import type { SessionKind } from './types'

interface SessionHead {
  id: string
  date: string
  complete: boolean
}

interface SessionPortalViewProps {
  kind: SessionKind
  tournament: Tournament
  sessions: SessionHead[] | undefined
  isPending: boolean
  error: Error | null
  onRetry: () => void
}

/** The header and tabs shared by a squad's and a sweeper's pages (D-22, D-60). */
function SessionPortalView({
  kind,
  tournament,
  sessions,
  isPending,
  error,
  onRetry,
}: Readonly<SessionPortalViewProps>) {
  // Stryker disable next-line StringLiteral: the route always has this param; this only satisfies the type.
  const { sessionId = '' } = useParams()
  const label = kind === 'squad' ? 'Squad' : 'Sweeper'
  const listPath = `/tournaments/${tournament.id}/${kind}s`

  if (isPending) return <Loading label={`Loading ${kind}…`} />
  if (error) return <QueryError error={error} onRetry={onRetry} />
  const session = sessions?.find((candidate) => candidate.id === sessionId)
  if (!session) {
    return (
      <>
        <title>{`${label} not found · Tournament Director`}</title>
        <h1>{label} not found</h1>
        <p>This {kind} does not exist. It may have been removed.</p>
        <p>
          <Link to={listPath}>All {kind}s</Link>
        </p>
      </>
    )
  }

  const date = formatSessionDate(session.date)
  return (
    <>
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <ol>
          <li>
            <Link to={`/tournaments/${tournament.id}`}>{tournament.name}</Link>
          </li>
          <li>
            <Link to={listPath}>{label}s</Link>
          </li>
          <li aria-current="page">{date}</li>
        </ol>
      </nav>
      <h1 className={styles.title}>
        {date}
        <span className={styles.status}>{session.complete ? 'Complete' : 'Open'}</span>
      </h1>
      <nav aria-label={`${label} pages`}>
        <ul className={styles.tabs}>
          <Can permission="lanes.read">
            <li>
              <NavLink to="lanes">Lane assignments</NavLink>
            </li>
          </Can>
          <li>
            <NavLink to="scores">Scores</NavLink>
          </li>
          <li>
            <NavLink to="results">Results</NavLink>
          </li>
        </ul>
      </nav>
      <Outlet context={tournament} />
    </>
  )
}

/** The page header for a squad (D-22, D-60). Its root opens the lanes tab. */
export function SquadPortal() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useSquads(id)
  return (
    <SessionPortalView
      kind="squad"
      tournament={tournament}
      sessions={data}
      isPending={isPending}
      error={error}
      onRetry={() => {
        void refetch()
      }}
    />
  )
}

/** The page header for a sweeper (D-22, D-60). */
export function SweeperPortal() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useSweepers(id)
  return (
    <SessionPortalView
      kind="sweeper"
      tournament={tournament}
      sessions={data}
      isPending={isPending}
      error={error}
      onRetry={() => {
        void refetch()
      }}
    />
  )
}

/**
 * The portal root has no page of its own. It opens the lanes tab (D-60) for a user who may see
 * lanes, and the scores tab for everyone else, since lanes need sign-in (D-59, D-52).
 */
export function OpenLanes() {
  const { data, isPending, error } = useMe()
  if (isPending) return <Loading label="Checking sign-in…" />
  // A failed check opens the public tab; the lanes tab would show its own error.
  const canSeeLanes = !error && data.user?.permissions.includes('lanes.read') === true
  return <Navigate to={canSeeLanes ? 'lanes' : 'scores'} replace />
}
