import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Toast } from '../../shared/Toast'
import { TournamentNotFoundError, tournamentKeys } from '../../shared/tournamentQuery'
import {
  TournamentDeleteRefusedError,
  TournamentDeleteWarningError,
  type DeleteCounts,
} from './api'
import { DeleteTournamentDialog } from './DeleteTournamentDialog'
import styles from './DeleteTournament.module.css'
import danger from '../../shared/Danger.module.css'
import type { Tournament } from './types'
import { useDeleteTournament } from './useDeleteTournament'

/**
 * The "Delete tournament" button and everything it opens (TRN-36, TRN-37, D-132 to D-136). The
 * overview and the edit page both show it, so the flow lives here once. Callers wrap it in
 * `<Can permission="tournaments.delete">`: the API still decides.
 */
export function DeleteTournamentButton({ tournament }: Readonly<{ tournament: Tournament }>) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const remove = useDeleteTournament(tournament.id)
  const [open, setOpen] = useState(false)
  // Set once the API asked the director to confirm (TRN-34).
  const [warning, setWarning] = useState<{ text: string; counts: DeleteCounts } | undefined>()
  const [failure, setFailure] = useState<string | undefined>()
  // Set when the API refused (TRN-33): shown in a toast after the dialog closes.
  const [refusal, setRefusal] = useState<string[] | undefined>()

  // Counts each time the dialog closes. A reply that lands after a close belongs to a dialog that
  // is gone, so it must not set state for the next one.
  const closes = useRef(0)

  function close() {
    closes.current += 1
    setOpen(false)
    setWarning(undefined)
    setFailure(undefined)
  }

  // Leave first, then drop the cached reads: the tournament layout would otherwise refetch the
  // deleted id and flash "not found" before the list appears.
  async function leave(state: { deleted: true } | { alreadyDeleted: true }) {
    await navigate('/tournaments', { state })
    queryClient.removeQueries({ queryKey: tournamentKeys.detail(tournament.id) })
    await queryClient.invalidateQueries({ queryKey: tournamentKeys.all })
  }

  async function confirm() {
    setFailure(undefined)
    const closesAtStart = closes.current
    try {
      await remove.mutateAsync({ confirm: warning?.counts })
      await leave({ deleted: true })
    } catch (error) {
      if (closes.current !== closesAtStart) return
      if (error instanceof TournamentDeleteWarningError) {
        // The first warning, or a fresh one because the counts moved: show what goes now.
        setWarning({
          text: error.warnings.map((item) => item.message).join(' '),
          counts: error.counts,
        })
      } else if (error instanceof TournamentDeleteRefusedError) {
        close()
        setRefusal(error.reasons)
      } else if (error instanceof TournamentNotFoundError) {
        await leave({ alreadyDeleted: true })
      } else {
        // Stryker disable next-line StringLiteral: a failed request always throws an Error; this only satisfies the type.
        setFailure(error instanceof Error ? error.message : 'Failed to delete the tournament')
      }
    }
  }

  return (
    <>
      <button
        type="button"
        className={danger.trigger}
        onClick={() => {
          setRefusal(undefined)
          setOpen(true)
        }}
      >
        Delete tournament
      </button>
      {open && (
        <DeleteTournamentDialog
          tournamentName={tournament.name}
          warning={warning?.text}
          pending={remove.isPending}
          failure={failure}
          onConfirm={() => {
            void confirm()
          }}
          onClose={close}
        />
      )}
      {refusal && (
        <Toast
          kind="error"
          onDismiss={() => {
            setRefusal(undefined)
          }}
        >
          <ul className={styles.reasons}>
            {refusal.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Toast>
      )}
    </>
  )
}
