import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { TournamentRejectedError, TournamentWarningsError } from './api'
import { editNotes } from './editNotes'
import { TournamentForm, type FieldNotes } from './TournamentForm'
import type { EditInfo, Tournament, TournamentSettingsView } from './types'
import { useEditInfo } from './useEditInfo'
import { useTournamentSettings } from './useTournamentSettings'
import { useUpdateTournament } from './useUpdateTournament'
import { toChanges, toFormValues } from './validateTournament'

/**
 * The edit form (TRN-29, D-127 to D-130). It sits inside the tournament layout, which has loaded
 * the tournament. The settings and what depends on them load here, so the form can show its locks
 * and "asks you to confirm" lines before the director types.
 */
export function EditTournamentPage() {
  const tournament = useOutletContext<Tournament>()
  const settings = useTournamentSettings(tournament.id)
  const info = useEditInfo(tournament.id)

  if (settings.data === undefined || info.data === undefined) {
    const error = settings.error ?? info.error
    return (
      <>
        <title>{`Edit ${tournament.name} · Tournament Director`}</title>
        <h1>Edit tournament</h1>
        {error ? (
          <QueryError
            error={error}
            onRetry={() => {
              void settings.refetch()
              void info.refetch()
            }}
          />
        ) : (
          <Loading label="Loading the form…" rows={3} />
        )}
      </>
    )
  }
  return <EditForm tournament={tournament} settings={settings.data} info={info.data} />
}

interface EditFormProps {
  tournament: Tournament
  settings: TournamentSettingsView
  info: EditInfo
}

/** Replace the create form's hints: none on a frozen tournament, a note on an unset ratio (D-17). */
function hintsFor(settings: TournamentSettingsView): FieldNotes {
  if (settings.completed) {
    return { entryFee: '', games: '', finalsRatio: '', cashRatio: '', superSweeperCashRatio: '' }
  }
  if (settings.superSweeperCashRatio === 0) {
    return {
      superSweeperCashRatio:
        'Stored as 0 (not set). Super sweeper results cannot be worked out until you set this. At least 1.',
    }
  }
  return {}
}

function EditForm({ tournament, settings, info }: Readonly<EditFormProps>) {
  const navigate = useNavigate()
  const update = useUpdateTournament(tournament.id)
  const [failure, setFailure] = useState<string | undefined>()
  // Frozen at load: the form must not reset when a background refetch lands.
  const [initial] = useState(() => toFormValues(tournament, settings))
  const { locks, confirms } = editNotes(settings, info)

  return (
    <>
      <title>{`Edit ${tournament.name} · Tournament Director`}</title>
      <h1>Edit tournament</h1>
      <p>{tournament.name}</p>
      <TournamentForm
        initialValues={initial}
        checkChangedOnly
        submitLabel="Save changes"
        pending={update.isPending}
        cancelTo={`/tournaments/${tournament.id}`}
        cancelLabel={settings.completed ? 'Back to tournament' : 'Cancel'}
        frozen={settings.completed}
        banner={
          settings.completed ? (
            <>
              <strong>Completed</strong> This tournament is complete and frozen. Nothing in it can
              change.
            </>
          ) : undefined
        }
        locks={locks}
        confirms={confirms}
        hints={hintsFor(settings)}
        onAttempt={() => {
          setFailure(undefined)
        }}
        onFailure={setFailure}
        onSubmit={async (values, confirmWarnings) => {
          try {
            await update.mutateAsync({
              ...toChanges(initial, values),
              ...(confirmWarnings ? { confirmWarnings: true } : {}),
            })
            // The overview shows the toast; router state outlives this page.
            await navigate(`/tournaments/${tournament.id}`, { state: { saved: true } })
          } catch (error) {
            if (error instanceof TournamentWarningsError) return { warnings: error.warnings }
            if (error instanceof TournamentRejectedError && Object.keys(error.errors).length > 0) {
              return { errors: error.errors }
            }
            // Stryker disable next-line StringLiteral: a failed request always throws an Error; this only satisfies the type.
            const message = error instanceof Error ? error.message : 'Failed to save the tournament'
            return { failure: message }
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
