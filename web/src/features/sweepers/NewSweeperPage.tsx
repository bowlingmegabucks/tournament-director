import { useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { useDivisions } from '../divisions/useDivisions'
import type { Tournament } from '../tournaments/types'
import { useTournamentSettings } from '../tournaments/useTournamentSettings'
import { SweeperRejectedError } from './api'
import { SweeperForm } from './SweeperForm'
import { startingValues, toNewSweeper } from './validateSweeper'
import { useCreateSweeper } from './useCreateSweeper'
import { useSweepers } from './useSweepers'

/**
 * The add-sweeper page (SQD-10 to SQD-13, D-174). A complete tournament shows a short notice in
 * place of the form (D-171); the API refuses it too.
 */
export function NewSweeperPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const navigate = useNavigate()
  const settings = useTournamentSettings(id)
  // The list gives the lanes and per pair the form starts with (D-178). It is a courtesy: if the
  // read fails, the form starts blank.
  const sweepers = useSweepers(id)
  // Read afresh, so a division added a moment ago has its box (D-177).
  const divisions = useDivisions(id, { refetchOnMount: 'always' })
  const create = useCreateSweeper(id)
  const [failure, setFailure] = useState<string | undefined>()
  const listUrl = `/tournaments/${id}/sweepers`

  const heading = (
    <>
      <title>{`New sweeper · ${tournament.name} · Tournament Director`}</title>
      <h1>New sweeper</h1>
    </>
  )

  if (settings.isPending || sweepers.isPending || divisions.isPending) {
    return (
      <>
        {heading}
        <Loading label="Loading…" rows={3} />
      </>
    )
  }
  const failed = (error: Error) => (
    <>
      {heading}
      <QueryError
        error={error}
        onRetry={() => {
          void settings.refetch()
          void divisions.refetch()
        }}
      />
    </>
  )
  if (settings.error) return failed(settings.error)
  if (divisions.error) return failed(divisions.error)
  if (settings.data.completed) {
    return (
      <>
        {heading}
        <p>
          <strong>This tournament is complete</strong>
        </p>
        <p>A complete tournament cannot be changed, so you cannot add a sweeper.</p>
        <Link to={listUrl}>Back to sweepers</Link>
      </>
    )
  }

  const shown = divisions.data.map((division) => ({ id: division.id, name: division.name }))
  const shownIds = shown.map((division) => division.id)

  return (
    <>
      {heading}
      <SweeperForm
        initialValues={startingValues(sweepers.data)}
        dates={{ startDate: tournament.startDate, endDate: tournament.endDate }}
        divisions={shown}
        pending={create.isPending}
        cancelTo={listUrl}
        addDivisionTo={`/tournaments/${id}/divisions/new`}
        onAttempt={() => {
          setFailure(undefined)
        }}
        onFailure={setFailure}
        onSubmit={async (values) => {
          try {
            await create.mutateAsync(toNewSweeper(values, shownIds))
            // The list shows the toast; router state outlives this page.
            await navigate(listUrl, { state: { created: true } })
          } catch (error) {
            if (error instanceof SweeperRejectedError) {
              // A reason that is not about a field (a complete tournament) is a toast, not a field error.
              if (error.tournament !== undefined) return { failure: error.tournament }
              if (Object.keys(error.errors).length > 0) return { errors: error.errors }
            }
            return {
              // Stryker disable next-line StringLiteral: every failure the API call throws is an Error; the text only satisfies the type.
              failure: error instanceof Error ? error.message : 'Failed to save the sweeper',
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
