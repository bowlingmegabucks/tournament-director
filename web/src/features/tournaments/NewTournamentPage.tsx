import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Page } from '../../shared/Page'
import { Toast } from '../../shared/Toast'
import { TournamentRejectedError } from './api'
import { TournamentForm } from './TournamentForm'
import { useCreateTournament } from './useCreateTournament'
import { emptyTournamentForm, toNewTournament } from './validateTournament'

/** The create form (TRN-22, D-120). Checks run in the browser; the API checks again (D-121). */
export function NewTournamentPage() {
  const navigate = useNavigate()
  const create = useCreateTournament()
  const [failure, setFailure] = useState<string | undefined>()

  return (
    <Page>
      <title>New tournament · Tournament Director</title>
      <h1>New tournament</h1>
      <TournamentForm
        initialValues={emptyTournamentForm}
        submitLabel="Save tournament"
        pending={create.isPending}
        cancelTo="/tournaments"
        onAttempt={() => {
          setFailure(undefined)
        }}
        onFailure={setFailure}
        onSubmit={async (values) => {
          try {
            const tournament = await create.mutateAsync(toNewTournament(values))
            // The overview shows the toast; router state outlives this page.
            await navigate(`/tournaments/${tournament.id}`, { state: { created: true } })
          } catch (error) {
            if (error instanceof TournamentRejectedError && Object.keys(error.errors).length > 0) {
              return { errors: error.errors }
            }
            return {
              failure: error instanceof Error ? error.message : 'Failed to save the tournament',
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
    </Page>
  )
}
