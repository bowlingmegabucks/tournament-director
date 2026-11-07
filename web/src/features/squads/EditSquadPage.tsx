import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import type { SessionEditInfo } from '../../shared/sessionEdit'
import { SessionRejectedError, SessionWarningsError } from '../../shared/sessionEditApi'
import { formatFee, formatRatio, formatSessionDate } from '../../shared/sessionFormat'
import { useSessionEditInfo } from '../../shared/useSessionEditInfo'
import { Toast } from '../../shared/Toast'
import type { Tournament } from '../tournaments/types'
import { useTournamentSettings } from '../tournaments/useTournamentSettings'
import { squadEditNotes } from './editNotes'
import { SquadForm } from './SquadForm'
import { squadFields, type Squad, type SquadFieldErrors } from './types'
import { useSquads } from './useSquads'
import { useUpdateSquad } from './useUpdateSquad'
import { toFormValues, toSquadChanges } from './validateSquad'

/** The messages of the boxes the form has; `tournament` and `session` are not boxes. */
function boxErrors(errors: Record<string, string>): SquadFieldErrors {
  const found: SquadFieldErrors = {}
  for (const name of squadFields) {
    const message = errors[name]
    if (message !== undefined) found[name] = message
  }
  return found
}

/**
 * The edit-squad page (SQD-27, D-185). A complete tournament or squad shows a short notice in place
 * of the form (D-181); the API refuses it too. The squad comes from the list the Squads page
 * already reads, so there is no single-squad route.
 */
export function EditSquadPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id and a :sessionId; this only satisfies the type.
  const { id = '', sessionId = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  // The form freezes its starting values, so it must start from data fetched after this page
  // opened, not from whatever an earlier visit left in the cache.
  const [openedAt] = useState(() => Date.now())
  // Stryker disable next-line ObjectLiteral: a query with the default stale time refetches on mount anyway, and `fresh` below waits for that fetch; 'always' only states the intent.
  const settings = useTournamentSettings(id, { refetchOnMount: 'always' })
  // Stryker disable next-line ObjectLiteral: same as above.
  const squads = useSquads(id, { refetchOnMount: 'always' })
  // Stryker disable next-line ObjectLiteral: same as above.
  const info = useSessionEditInfo('squads', id, sessionId, { refetchOnMount: 'always' })
  const listUrl = `/tournaments/${id}/squads`

  const heading = (
    <>
      <title>{`Edit squad · ${tournament.name} · Tournament Director`}</title>
      <h1>Edit squad</h1>
    </>
  )

  const error = settings.error ?? squads.error
  // Stryker disable next-line EqualityOperator: a fetch that lands in the very millisecond the page opened cannot be told apart in a test.
  const fresh = (updatedAt: number) => updatedAt >= openedAt
  const squad = squads.data?.find((candidate) => candidate.id === sessionId)

  if (
    settings.data === undefined ||
    // Stryker disable next-line ConditionalExpression: `fresh(squads.dataUpdatedAt)` is false while there is no data, so this guard only narrows the type.
    squads.data === undefined ||
    !fresh(settings.dataUpdatedAt) ||
    !fresh(squads.dataUpdatedAt)
  ) {
    return (
      <>
        {heading}
        {error ? (
          <QueryError
            error={error}
            onRetry={() => {
              void settings.refetch()
              void squads.refetch()
              void info.refetch()
            }}
          />
        ) : (
          <Loading label="Loading the form…" rows={3} />
        )}
      </>
    )
  }
  if (settings.data.completed) {
    return (
      <>
        {heading}
        <p>
          <strong>This tournament is complete</strong>
        </p>
        <p>A complete tournament cannot be changed, so you cannot edit a squad.</p>
        <Link to={listUrl}>Back to squads</Link>
      </>
    )
  }
  if (!squad) {
    return (
      <>
        {heading}
        <p>
          <strong>Squad not found</strong>
        </p>
        <p>It may have been removed, or the link may be wrong.</p>
        <Link to={listUrl}>Back to squads</Link>
      </>
    )
  }
  if (squad.complete) {
    return (
      <>
        {heading}
        <p>
          <strong>This squad is complete</strong>
        </p>
        <p>A complete squad cannot be changed.</p>
        <Link to={listUrl}>Back to squads</Link>
      </>
    )
  }
  if (info.data === undefined || !fresh(info.dataUpdatedAt)) {
    return (
      <>
        {heading}
        {info.error ? (
          <QueryError
            error={info.error}
            onRetry={() => {
              void info.refetch()
            }}
          />
        ) : (
          <Loading label="Loading the form…" rows={3} />
        )}
      </>
    )
  }
  return (
    <EditForm
      tournament={tournament}
      settings={settings.data}
      squad={squad}
      info={info.data}
      heading={heading}
      listUrl={listUrl}
    />
  )
}

interface EditFormProps {
  tournament: Tournament
  settings: { finalsRatio: number; cashRatio: number }
  squad: Squad
  info: SessionEditInfo
  heading: ReactNode
  listUrl: string
}

function EditForm({
  tournament,
  settings,
  squad,
  info,
  heading,
  listUrl,
}: Readonly<EditFormProps>) {
  const navigate = useNavigate()
  const update = useUpdateSquad(tournament.id, squad.id)
  const [failure, setFailure] = useState<string | undefined>()
  // Frozen at load: the form must not reset when a background refetch lands.
  const [initial] = useState(() => toFormValues(squad))

  return (
    <>
      {heading}
      <p>{formatSessionDate(squad.date)}</p>
      <SquadForm
        initialValues={initial}
        dates={{ startDate: tournament.startDate, endDate: tournament.endDate }}
        tournamentValues={{
          entryFee: formatFee(tournament.entryFee),
          finalsRatio: formatRatio(settings.finalsRatio),
          cashRatio: formatRatio(settings.cashRatio),
        }}
        checkChangedOnly
        notes={squadEditNotes(info)}
        submitLabel="Save changes"
        pending={update.isPending}
        cancelTo={listUrl}
        onAttempt={() => {
          setFailure(undefined)
        }}
        onFailure={setFailure}
        onSubmit={async (values, confirmWarnings) => {
          try {
            await update.mutateAsync({ changes: toSquadChanges(initial, values), confirmWarnings })
            // The list shows the toast; router state outlives this page.
            await navigate(listUrl, { state: { saved: true } })
          } catch (error) {
            if (error instanceof SessionWarningsError) return { warnings: error.warnings }
            if (error instanceof SessionRejectedError) {
              // A reason that is not about a box (the tournament or squad turned complete) is a toast.
              if (error.tournament !== undefined) return { failure: error.tournament }
              if (error.session !== undefined) return { failure: error.session }
              const errors = boxErrors(error.errors)
              if (Object.keys(errors).length > 0) return { errors }
            }
            return {
              // Stryker disable next-line StringLiteral: every failure the API call throws is an Error; the text only satisfies the type.
              failure: error instanceof Error ? error.message : 'Failed to save the squad',
            }
          }
          return undefined
        }}
      />
      {failure && (
        <Toast
          kind="error"
          onDismiss={() => {
            setFailure(undefined)
          }}
        >
          {failure}
        </Toast>
      )}
    </>
  )
}
