import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import type { Tournament } from '../tournaments/types'
import { useTournamentSettings } from '../tournaments/useTournamentSettings'
import { DivisionRejectedError, DivisionWarningsError } from './api'
import { DivisionForm } from './DivisionForm'
import { editNotes } from './editNotes'
import type { Division, DivisionEditInfo } from './types'
import { useDivisionEditInfo } from './useDivisionEditInfo'
import { useDivisions } from './useDivisions'
import { useUpdateDivision } from './useUpdateDivision'
import { toDivisionChanges, toFormValues } from './validateDivision'

/**
 * The edit-division page (DIV-12, D-147). A complete tournament shows a short notice in place of the
 * form (D-149); the API refuses it too. The division comes from the list the Divisions page already
 * reads, so there is no single-division route.
 */
export function EditDivisionPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id and a :divisionId; this only satisfies the type.
  const { id = '', divisionId = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  // The form freezes its starting values, so it must start from data fetched after this page
  // opened, not from whatever an earlier visit left in the cache.
  const [openedAt] = useState(() => Date.now())
  // Stryker disable next-line ObjectLiteral: a query with the default stale time refetches on mount anyway, and `fresh` below waits for that fetch; 'always' only states the intent.
  const settings = useTournamentSettings(id, { refetchOnMount: 'always' })
  // Stryker disable next-line ObjectLiteral: same as above.
  const divisions = useDivisions(id, { refetchOnMount: 'always' })
  // Stryker disable next-line ObjectLiteral: same as above.
  const info = useDivisionEditInfo(id, divisionId, { refetchOnMount: 'always' })
  const listUrl = `/tournaments/${id}/divisions`

  const heading = (
    <>
      <title>{`Edit division · ${tournament.name} · Tournament Director`}</title>
      <h1>Edit division</h1>
    </>
  )

  const error = settings.error ?? divisions.error ?? info.error
  // Stryker disable next-line EqualityOperator: a fetch that lands in the very millisecond the page opened cannot be told apart in a test.
  const fresh = (updatedAt: number) => updatedAt >= openedAt
  const division = divisions.data?.find((candidate) => candidate.id === divisionId)

  if (
    settings.data === undefined ||
    // Stryker disable next-line ConditionalExpression: `fresh(divisions.dataUpdatedAt)` is false while there is no data, so this guard only narrows the type.
    divisions.data === undefined ||
    !fresh(settings.dataUpdatedAt) ||
    !fresh(divisions.dataUpdatedAt)
  ) {
    return (
      <>
        {heading}
        {error ? (
          <QueryError
            error={error}
            onRetry={() => {
              void settings.refetch()
              void divisions.refetch()
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
        <p>A complete tournament cannot be changed, so you cannot edit a division.</p>
        <Link to={listUrl}>Back to divisions</Link>
      </>
    )
  }
  if (!division) {
    return (
      <>
        {heading}
        <p>
          <strong>Division not found</strong>
        </p>
        <p>It may have been removed, or the link may be wrong.</p>
        <Link to={listUrl}>Back to divisions</Link>
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
      division={division}
      info={info.data}
      heading={heading}
      listUrl={listUrl}
    />
  )
}

interface EditFormProps {
  tournament: Tournament
  division: Division
  info: DivisionEditInfo
  heading: ReactNode
  listUrl: string
}

function EditForm({ tournament, division, info, heading, listUrl }: Readonly<EditFormProps>) {
  const navigate = useNavigate()
  const update = useUpdateDivision(tournament.id, division.id)
  const [failure, setFailure] = useState<string | undefined>()
  // Frozen at load: the form must not reset when a background refetch lands.
  const [initial] = useState(() => toFormValues(division))

  return (
    <>
      {heading}
      <p>{division.name}</p>
      <DivisionForm
        number={division.number}
        initialValues={initial}
        checkChangedOnly
        confirms={editNotes(info)}
        submitLabel="Save changes"
        pending={update.isPending}
        cancelTo={listUrl}
        onAttempt={() => {
          setFailure(undefined)
        }}
        onFailure={setFailure}
        onSubmit={async (values, confirmWarnings) => {
          try {
            await update.mutateAsync({
              changes: toDivisionChanges(initial, values),
              confirmWarnings,
            })
            // The list shows the toast; router state outlives this page.
            await navigate(listUrl, { state: { saved: true } })
          } catch (error) {
            if (error instanceof DivisionWarningsError) return { warnings: error.warnings }
            if (error instanceof DivisionRejectedError) {
              // A reason that is not about a field (a complete tournament) is a toast, not a field error.
              if (error.tournament !== undefined) return { failure: error.tournament }
              if (Object.keys(error.errors).length > 0) return { errors: error.errors }
            }
            return {
              // Stryker disable next-line StringLiteral: every failure the API call throws is an Error; the text only satisfies the type.
              failure: error instanceof Error ? error.message : 'Failed to save the division',
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
