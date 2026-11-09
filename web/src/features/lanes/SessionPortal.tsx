import { useCallback, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useOutletContext, useParams } from 'react-router'
import { Can } from '../auth/Can'
import { useMe } from '../auth/useMe'
import { CompleteSessionButton } from '../../shared/CompleteSessionButton'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatSessionDate } from '../../shared/sessionFormat'
import { Toast } from '../../shared/Toast'
import { useSquads } from '../squads/useSquads'
import { useSweepers } from '../sweepers/useSweepers'
import type { Tournament } from '../tournaments/types'
import { useTournamentOpen } from '../tournaments/useTournamentOpen'
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

/** What the page says after a complete: a success, or the reasons the API refused (D-195). */
type CompleteNotice = { kind: 'success'; text: string } | { kind: 'error'; reasons: string[] }

/** "Squad completed. 3 bowlers got zeros." Only a squad saves zeros, and none for no no-shows (D-190, D-191). */
function completedText(label: string, noShowCount: number): string {
  if (noShowCount === 0) return `${label} completed.`
  const bowlers = noShowCount === 1 ? '1 bowler' : `${noShowCount} bowlers`
  return `${label} completed. ${bowlers} got zeros.`
}

/**
 * The Complete button of the header. It sits inside `<Can>`, so a visitor without the permission
 * never reads the settings. A complete session or tournament has no button (D-195, D-19); the API
 * decides all the same.
 */
function CompleteButton({
  kind,
  tournamentId,
  session,
  onCompleted,
  onRefused,
}: Readonly<{
  kind: SessionKind
  tournamentId: string
  session: SessionHead
  onCompleted: (result: { noShowCount: number }) => void
  onRefused: (reasons: string[]) => void
}>) {
  const tournamentOpen = useTournamentOpen(tournamentId)
  if (!tournamentOpen || session.complete) return null
  return (
    <CompleteSessionButton
      kind={kind === 'squad' ? 'squads' : 'sweepers'}
      tournamentId={tournamentId}
      session={session}
      onCompleted={onCompleted}
      onRefused={onRefused}
    />
  )
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
  const { isPending: meIsPending } = useMe()
  const [notice, setNotice] = useState<CompleteNotice | undefined>()
  const dismiss = useCallback(
    () => {
      setNotice(undefined)
    },
    // Stryker disable next-line ArrayDeclaration: `setNotice` never changes, so extra deps change nothing a test can see.
    [],
  )

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
      <div className={styles.head}>
        <h1 className={styles.title}>
          {date}
          <span className={styles.status}>{session.complete ? 'Complete' : 'Open'}</span>
        </h1>
        <Can permission="squads.write">
          <CompleteButton
            kind={kind}
            tournamentId={tournament.id}
            session={session}
            onCompleted={({ noShowCount }) => {
              setNotice({ kind: 'success', text: completedText(label, noShowCount) })
            }}
            onRefused={(reasons) => {
              setNotice({ kind: 'error', reasons })
            }}
          />
        </Can>
      </div>
      {notice?.kind === 'success' && (
        <Toast kind="success" autoDismissMs={6000} onDismiss={dismiss}>
          {notice.text}
        </Toast>
      )}
      {notice?.kind === 'error' && (
        <Toast kind="error" onDismiss={dismiss}>
          <ul className={styles.reasons}>
            {notice.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Toast>
      )}
      <nav aria-label={`${label} pages`}>
        {/* Wait for /v1/me, so the tabs appear once and do not shift under the pointer. */}
        <ul className={styles.tabs} hidden={meIsPending}>
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
