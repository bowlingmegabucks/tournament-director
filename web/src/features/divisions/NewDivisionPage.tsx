import { useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { useTournamentSettings } from '../tournaments/useTournamentSettings'
import type { Tournament } from '../tournaments/types'
import { DivisionRejectedError, DivisionWarningsError } from './api'
import { DivisionForm } from './DivisionForm'
import { nextDivisionNumber, toNewDivision } from './validateDivision'
import { useCreateDivision } from './useCreateDivision'
import { useDivisions } from './useDivisions'

/**
 * The add-division page (DIV-12, D-144). A complete tournament shows a short notice in place of
 * the form (D-143); the API refuses it too.
 */
export function NewDivisionPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const navigate = useNavigate()
  const settings = useTournamentSettings(id)
  // The list gives the number the box shows. It is a courtesy: the server picks the real one (D-139).
  const divisions = useDivisions(id)
  const create = useCreateDivision(id)
  const [failure, setFailure] = useState<string | undefined>()
  const listUrl = `/tournaments/${id}/divisions`

  const heading = (
    <>
      <title>{`New division · ${tournament.name} · Tournament Director`}</title>
      <h1>New division</h1>
    </>
  )

  if (settings.isPending) {
    return (
      <>
        {heading}
        <Loading label="Loading…" rows={3} />
      </>
    )
  }
  if (settings.error) {
    return (
      <>
        {heading}
        <QueryError
          error={settings.error}
          onRetry={() => {
            void settings.refetch()
          }}
        />
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
        <p>A complete tournament cannot be changed, so you cannot add a division.</p>
        <Link to={listUrl}>Back to divisions</Link>
      </>
    )
  }

  return (
    <>
      {heading}
      <DivisionForm
        number={divisions.data ? nextDivisionNumber(divisions.data) : undefined}
        pending={create.isPending}
        cancelTo={listUrl}
        onAttempt={() => {
          setFailure(undefined)
        }}
        onFailure={setFailure}
        onSubmit={async (values, confirmWarnings) => {
          try {
            await create.mutateAsync({ input: toNewDivision(values), confirmWarnings })
            // The list shows the toast; router state outlives this page.
            await navigate(listUrl, { state: { created: true } })
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
