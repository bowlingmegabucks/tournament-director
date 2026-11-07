import { useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatFee, formatRatio } from '../../shared/sessionFormat'
import { Toast } from '../../shared/Toast'
import type { Tournament } from '../tournaments/types'
import { useTournamentSettings } from '../tournaments/useTournamentSettings'
import { SquadRejectedError } from './api'
import { SquadForm } from './SquadForm'
import { startingValues, toNewSquad } from './validateSquad'
import { useCreateSquad } from './useCreateSquad'
import { useSquads } from './useSquads'

/**
 * The add-squad page (SQD-01 to SQD-08, D-167). A complete tournament shows a short notice in place
 * of the form (D-171); the API refuses it too.
 */
export function NewSquadPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const navigate = useNavigate()
  const settings = useTournamentSettings(id)
  // The list gives the lanes and per pair the form starts with (D-172). It is a courtesy: if the
  // read fails, the form starts blank.
  const squads = useSquads(id)
  const create = useCreateSquad(id)
  const [failure, setFailure] = useState<string | undefined>()
  const listUrl = `/tournaments/${id}/squads`

  const heading = (
    <>
      <title>{`New squad · ${tournament.name} · Tournament Director`}</title>
      <h1>New squad</h1>
    </>
  )

  if (settings.isPending || squads.isPending) {
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
        <p>A complete tournament cannot be changed, so you cannot add a squad.</p>
        <Link to={listUrl}>Back to squads</Link>
      </>
    )
  }

  return (
    <>
      {heading}
      <SquadForm
        initialValues={startingValues(squads.data)}
        dates={{ startDate: tournament.startDate, endDate: tournament.endDate }}
        tournamentValues={{
          entryFee: formatFee(tournament.entryFee),
          finalsRatio: formatRatio(settings.data.finalsRatio),
          cashRatio: formatRatio(settings.data.cashRatio),
        }}
        pending={create.isPending}
        cancelTo={listUrl}
        onAttempt={() => {
          setFailure(undefined)
        }}
        onFailure={setFailure}
        onSubmit={async (values) => {
          try {
            await create.mutateAsync(toNewSquad(values))
            // The list shows the toast; router state outlives this page.
            await navigate(listUrl, { state: { created: true } })
          } catch (error) {
            if (error instanceof SquadRejectedError) {
              // A reason that is not about a field (a complete tournament) is a toast, not a field error.
              if (error.tournament !== undefined) return { failure: error.tournament }
              if (Object.keys(error.errors).length > 0) return { errors: error.errors }
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
